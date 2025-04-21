# Use Node.js LTS as the base image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm ci --force

# Copy the rest of the application
COPY . .

# Install NX globally
RUN npm install -g nx

# Build the application
RUN nx build copart-notifier

# Expose the port the app runs on
EXPOSE 3000

# Command to run the application
CMD ["node", "dist/apps/copart-notifier/main.js"]
