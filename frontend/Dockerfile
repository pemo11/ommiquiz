FROM node:18-alpine AS build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy environment file for production build
COPY .env.production ./

# Copy source code
COPY public/ ./public/
COPY src/ ./src/

# Set NODE_ENV to production for the build
ENV NODE_ENV=production

# Build the app
RUN npm run build

# Production stage with nginx
FROM nginx:alpine

# Copy build files
COPY --from=build /app/build /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
