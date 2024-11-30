# Etapa 1: Usar a imagem base com Node.js
FROM node:20

# Etapa 2: Definir o diretório de trabalho no container
WORKDIR /app

# Etapa 3: Copiar os arquivos de configuração do npm (package.json e package-lock.json)
COPY package*.json ./

# Etapa 4: Instalar as dependências do projeto
RUN npm install

# Etapa 5: Copiar todo o código-fonte para o diretório de trabalho no container
COPY . .

# Etapa 6: Rodar o build (gerar arquivos finais para produção, se necessário)
RUN npm run build

# Etapa 7: Expor a porta que o app vai rodar
EXPOSE 3000

# Etapa 8: Definir o comando para iniciar a aplicação
CMD ["npm", "start"]
