FROM node:16-alpine
RUN apk --no-cache add git
WORKDIR /app
COPY . /app
RUN yarn install
RUN yarn lint
EXPOSE 5000
CMD ["yarn","start"]
