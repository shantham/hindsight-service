# Hindsight Service Dockerfile
# ============================
# Pure JavaScript - no native compilation needed

FROM node:20-alpine

WORKDIR /app

# Create non-root user for security
RUN addgroup -S hindsight && adduser -S hindsight -G hindsight

# Copy package files
COPY package*.json ./

# Install dependencies (no native modules)
RUN npm ci --production

# Copy application code
COPY . .

# Create data directory
RUN mkdir -p /app/data && chown -R hindsight:hindsight /app

# Switch to non-root user
USER hindsight

# Environment variables
ENV PORT=8765
ENV DATA_DIR=/app/data
ENV CONFIG_PATH=/app/config/config.yml
ENV NODE_ENV=production

# Expose port
EXPOSE 8765

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
  CMD wget -q --spider http://localhost:8765/health || exit 1

# Start server
CMD ["node", "src/server.js"]
