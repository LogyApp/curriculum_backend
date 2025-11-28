# Imagen base oficial de Node
FROM node:18

# Directorio principal
WORKDIR /app

# Instalar dependencias del sistema necesarias por Chromium / Puppeteer
RUN apt-get update && apt-get install -y \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libxss1 \
    wget \
  --no-install-recommends && rm -rf /var/lib/apt/lists/*

# Copiar package.json para instalar dependencias
COPY package*.json ./

# Instalar dependencias (ahora incluirá puppeteer)
RUN npm install --production

# Copiar todo el proyecto al contenedor
COPY . .

# Puerto que utiliza Cloud Run
ENV PORT=8080
EXPOSE 8080

# Ejecutar servidor
CMD ["node", "server.js"]