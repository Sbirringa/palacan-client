# Stage 1: Build the React application
# Usa un'immagine Node.js per la fase di build
# [palacan-p36] stessa versione di Node delle prove su GitHub
FROM node:22-alpine AS build

# Imposta la directory di lavoro all'interno del container
WORKDIR /app

# Copia i file di configurazione del progetto (package.json, package-lock.json)
COPY package*.json ./

# Installa le dipendenze di Node.js
# [palacan-p36] dipendenze esatte di package-lock.json
RUN npm ci

# Copia il resto del codice sorgente dell'applicazione
COPY . .

# Esegui la build di produzione di Vite
# Questo creerà la cartella 'dist' con i file compilati e ottimizzati
RUN npm run build

# Stage 2: Serve the application with Nginx
# Usa un'immagine Nginx leggera per servire i file statici
FROM nginx:alpine

# Copia i file compilati dalla fase di build alla directory di servizio di Nginx
COPY --from=build /app/dist /usr/share/nginx/html

# [palacan-l1a] intestazioni di sicurezza e Content-Security-Policy, generate dalla build (sicurezza/intestazioni.mjs)
COPY --from=build /app/dist/palacan-intestazioni.conf /etc/nginx/palacan-intestazioni.conf
COPY --from=build /app/dist/palacan-csp.conf /etc/nginx/palacan-csp.conf
RUN rm -f /usr/share/nginx/html/palacan-intestazioni.conf /usr/share/nginx/html/palacan-csp.conf
# [palacan-l1c] firma dell'elenco delle impronte (scritta da strumenti/pubblica_frontend.py, mai nel repository)
COPY rilascio/ /usr/share/nginx/html/rilascio/

# Rimuovi la configurazione predefinita di Nginx
RUN rm /etc/nginx/conf.d/default.conf

# Copia una configurazione Nginx personalizzata dalla sottocartella 'nginx'
COPY nginx/nginx.conf /etc/nginx/conf.d/nginx.conf

# Espone la porta 8080, che deve corrispondere a internal_port in fly.toml
EXPOSE 8080

# Comando per avviare Nginx
CMD ["nginx", "-g", "daemon off;"]
