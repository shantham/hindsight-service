/**
 * LLMProvider.js - Persistent Claude CLI and Anthropic API
 *
 * Supports two modes:
 * - 'persistent': RECOMMENDED - Keeps a single Claude CLI process running (zero cold start)
 * - 'api': Uses Anthropic SDK (for production/serverless)
 *
 * Usage:
 *   const provider = new LLMProvider({ mode: 'persistent', model: 'claude-sonnet-4-20250514' });
 *   await provider.initialize();  // Required for persistent mode
 *   const response = await provider.complete(prompt, systemPrompt);
 *   await provider.shutdown();    // Clean up on exit
 */

const { spawn } = require('child_process');
const { EventEmitter } = require('events');

// Provider states for persistent mode
const ProviderState = {
  STOPPED: 'STOPPED',
  STARTING: 'STARTING',
  READY: 'READY',
  BUSY: 'BUSY',
  ERROR: 'ERROR'
};

class LLMProvider extends EventEmitter {
  constructor(config = {}) {
    super();

    this.mode = config.mode || 'persistent';  // Default to persistent
    this.model = config.model || 'claude-sonnet-4-20250514';
    this.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
    this.maxTokens = config.maxTokens || 1000;
    this.timeout = config.timeout || 120000;  // 2 minutes

    // Persistent mode state
    this.process = null;
    this.state = ProviderState.STOPPED;
    this.stdoutBuffer = '';
    this.pendingPromise = null;
    this.promptIdCounter = 0;

    // Anthropic client for API mode
    this.client = null;
    if (this.mode === 'api' && this.apiKey) {
      this._initAnthropicClient();
    }

    this.stats = {
      completions: 0,
      totalTimeMs: 0,
      avgTimeMs: 0,
      errors: 0,
      coldStarts: 0
    };

    console.log(`[LLMProvider] Initialized in ${this.mode} mode with model ${this.model}`);
  }

  /**
   * Initialize the provider (required for persistent mode)
   * @returns {Promise<boolean>}
   */
  async initialize() {
    if (this.mode !== 'persistent') {
      return true;  // No initialization needed for other modes
    }

    if (this.state === ProviderState.READY) {
      return true;  // Already initialized
    }

    if (this.state === ProviderState.STARTING) {
      // Wait for initialization to complete
      return new Promise((resolve) => {
        this.once('ready', () => resolve(true));
        this.once('error', () => resolve(false));
      });
    }

    return this._startPersistentProcess();
  }

  /**
   * Start the persistent Claude CLI process
   * @private
   */
  async _startPersistentProcess() {
    this.state = ProviderState.STARTING;
    this.stats.coldStarts++;

    return new Promise((resolve, reject) => {
      console.log('[LLMProvider] Starting persistent Claude CLI process...');

      // Spawn Claude CLI with streaming JSON mode
      // This keeps the process alive and accepts JSON messages on stdin
      // Note: --verbose is required for stream-json output format
      const args = [
        '--print',
        '--verbose',
        '--input-format', 'stream-json',
        '--output-format', 'stream-json',
        '--dangerously-skip-permissions'
      ];

      this.process = spawn('claude', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env }
      });

      console.log(`[LLMProvider] Claude CLI spawned (PID: ${this.process.pid})`);

      // Handle stdout - parse JSON stream
      this.process.stdout.on('data', (data) => {
        this._handleStdout(data);
      });

      // Handle stderr (for logging)
      this.process.stderr.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg && !msg.includes('Loading')) {
          console.log(`[LLMProvider] stderr: ${msg}`);
        }
      });

      // Handle process exit
      this.process.on('exit', (code, signal) => {
        console.log(`[LLMProvider] Process exited (code=${code}, signal=${signal})`);
        this.process = null;
        this.state = ProviderState.STOPPED;

        // Reject pending promise if any
        if (this.pendingPromise) {
          this.pendingPromise.reject(new Error('Process exited unexpectedly'));
          this.pendingPromise = null;
        }

        this.emit('exit', { code, signal });
      });

      // Handle errors
      this.process.on('error', (error) => {
        console.error('[LLMProvider] Process error:', error.message);
        this.state = ProviderState.ERROR;
        this.emit('error', error);
        reject(error);
      });

      // Send a warmup message to verify the process is ready
      // Use a short timeout for warmup
      const warmupTimeout = setTimeout(() => {
        if (this.state === ProviderState.STARTING) {
          console.log('[LLMProvider] Warmup timeout - process may be loading model');
          this.state = ProviderState.READY;
          this.emit('ready');
          resolve(true);
        }
      }, 5000);

      // Send warmup prompt
      this._sendMessage('Hello')
        .then(() => {
          clearTimeout(warmupTimeout);
          console.log('[LLMProvider] Persistent Claude CLI ready');
          this.state = ProviderState.READY;
          this.emit('ready');
          resolve(true);
        })
        .catch((err) => {
          clearTimeout(warmupTimeout);
          console.error('[LLMProvider] Warmup failed:', err.message);
          // Still mark as ready - might work for subsequent calls
          if (this.process?.pid) {
            this.state = ProviderState.READY;
            this.emit('ready');
            resolve(true);
          } else {
            this.state = ProviderState.ERROR;
            reject(err);
          }
        });
    });
  }

  /**
   * Handle stdout data from Claude CLI
   * @private
   */
  _handleStdout(data) {
    this.stdoutBuffer += data.toString();

    // Process complete JSON lines
    const lines = this.stdoutBuffer.split('\n');
    this.stdoutBuffer = lines.pop() || '';  // Keep incomplete line in buffer

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const msg = JSON.parse(trimmed);
        this._handleMessage(msg);
      } catch (e) {
        // Not JSON - might be plain text (ignore)
      }
    }
  }

  /**
   * Handle a parsed message from Claude
   * @private
   */
  _handleMessage(msg) {
    if (!this.pendingPromise) return;

    switch (msg.type) {
      case 'assistant':
        // Extract text content
        if (msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === 'text' && block.text) {
              this.pendingPromise.response += block.text;
            }
          }
        }
        break;

      case 'result':
        // Conversation turn complete
        const response = this.pendingPromise.response || msg.result || '';
        const elapsed = Date.now() - this.pendingPromise.startTime;

        // Update stats
        this.stats.completions++;
        this.stats.totalTimeMs += elapsed;
        this.stats.avgTimeMs = Math.round(this.stats.totalTimeMs / this.stats.completions);

        console.log(`[LLMProvider] Completion in ${elapsed}ms (avg: ${this.stats.avgTimeMs}ms)`);

        this.pendingPromise.resolve(response);
        this.pendingPromise = null;
        this.state = ProviderState.READY;
        break;

      case 'error':
        this.stats.errors++;
        const errorMsg = msg.error?.message || msg.message || 'Unknown error';
        console.error('[LLMProvider] Error:', errorMsg);

        this.pendingPromise.reject(new Error(errorMsg));
        this.pendingPromise = null;
        this.state = ProviderState.READY;
        break;

      case 'system':
        // System messages (init, etc.) - ignore
        break;
    }
  }

  /**
   * Send a message to the persistent process
   * @private
   */
  async _sendMessage(content) {
    if (!this.process || !this.process.stdin.writable) {
      throw new Error('Process not running');
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingPromise = null;
        this.state = ProviderState.READY;
        reject(new Error(`Timeout after ${this.timeout}ms`));
      }, this.timeout);

      this.pendingPromise = {
        resolve: (response) => {
          clearTimeout(timeoutId);
          resolve(response);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
        response: '',
        startTime: Date.now()
      };

      this.state = ProviderState.BUSY;

      // Format message as stream-json input
      const jsonMessage = JSON.stringify({
        type: 'user',
        message: {
          role: 'user',
          content: content
        }
      });

      this.process.stdin.write(jsonMessage + '\n');
    });
  }

  /**
   * Complete a prompt using the configured provider
   * @param {string} prompt - User prompt
   * @param {string|null} systemPrompt - System prompt (optional)
   * @returns {Promise<string>} - LLM response text
   */
  async complete(prompt, systemPrompt = null) {
    // Build the full prompt
    let fullPrompt = prompt;
    if (systemPrompt) {
      fullPrompt = `${systemPrompt}\n\n---\n\n${prompt}`;
    }

    switch (this.mode) {
      case 'persistent':
        return this._persistentComplete(fullPrompt);
      case 'api':
        return this._anthropicAPI(prompt, systemPrompt);
      default:
        throw new Error(`Unknown mode: ${this.mode}. Supported modes: persistent, api`);
    }
  }

  /**
   * Complete using persistent Claude CLI
   * @private
   */
  async _persistentComplete(prompt) {
    // Auto-initialize if needed
    if (this.state === ProviderState.STOPPED) {
      console.log('[LLMProvider] Auto-initializing persistent process...');
      await this.initialize();
    }

    // Wait if busy
    if (this.state === ProviderState.BUSY) {
      await new Promise((resolve) => {
        const checkReady = setInterval(() => {
          if (this.state === ProviderState.READY) {
            clearInterval(checkReady);
            resolve();
          }
        }, 100);
      });
    }

    if (this.state !== ProviderState.READY) {
      throw new Error(`Provider not ready: ${this.state}`);
    }

    return this._sendMessage(prompt);
  }

  /**
   * Initialize Anthropic SDK client (lazy load)
   * @private
   */
  async _initAnthropicClient() {
    if (this.client) return;

    try {
      const Anthropic = require('@anthropic-ai/sdk');
      this.client = new Anthropic({ apiKey: this.apiKey });
      console.log('[LLMProvider] Anthropic client initialized');
    } catch (error) {
      console.error('[LLMProvider] Failed to initialize Anthropic client:', error.message);
      throw error;
    }
  }

  /**
   * Execute completion using Anthropic API SDK
   * @private
   */
  async _anthropicAPI(prompt, systemPrompt) {
    if (!this.client) {
      await this._initAnthropicClient();
    }

    const startTime = Date.now();

    try {
      console.log(`[LLMProvider] Calling Anthropic API with model ${this.model}...`);

      const params = {
        model: this.model,
        max_tokens: this.maxTokens,
        messages: [{ role: 'user', content: prompt }]
      };

      if (systemPrompt) {
        params.system = systemPrompt;
      }

      const message = await this.client.messages.create(params);

      const elapsed = Date.now() - startTime;
      this.stats.completions++;
      this.stats.totalTimeMs += elapsed;
      this.stats.avgTimeMs = Math.round(this.stats.totalTimeMs / this.stats.completions);

      console.log(`[LLMProvider] Anthropic API completed in ${elapsed}ms`);

      const textContent = message.content.find(c => c.type === 'text');
      return textContent ? textContent.text : '';
    } catch (error) {
      this.stats.errors++;
      console.error('[LLMProvider] Anthropic API error:', error.message);
      throw error;
    }
  }

  /**
   * Gracefully shutdown the provider
   */
  async shutdown() {
    if (this.mode !== 'persistent' || !this.process) {
      return;
    }

    console.log('[LLMProvider] Shutting down persistent process...');

    return new Promise((resolve) => {
      const forceKillTimeout = setTimeout(() => {
        if (this.process) {
          console.log('[LLMProvider] Force killing...');
          this.process.kill('SIGKILL');
        }
        this.process = null;
        this.state = ProviderState.STOPPED;
        resolve();
      }, 5000);

      // Close stdin to signal shutdown
      if (this.process.stdin.writable) {
        this.process.stdin.end();
      }

      this.process.once('exit', () => {
        clearTimeout(forceKillTimeout);
        this.process = null;
        this.state = ProviderState.STOPPED;
        console.log('[LLMProvider] Shutdown complete');
        resolve();
      });

      // Send SIGTERM
      setTimeout(() => {
        if (this.process) {
          this.process.kill('SIGTERM');
        }
      }, 1000);
    });
  }

  /**
   * Check if provider is ready
   */
  isReady() {
    if (this.mode === 'persistent') {
      return this.state === ProviderState.READY;
    }
    return true;  // API mode is always "ready"
  }

  /**
   * Get provider statistics
   */
  getStats() {
    return {
      mode: this.mode,
      model: this.model,
      state: this.state,
      ...this.stats
    };
  }

  /**
   * Get provider info
   */
  getInfo() {
    return {
      mode: this.mode,
      model: this.model,
      state: this.state,
      hasApiKey: !!this.apiKey,
      pid: this.process?.pid || null
    };
  }
}

module.exports = { LLMProvider, ProviderState };
