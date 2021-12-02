const { createServer } = require('http')
const express = require('express')
const bodyParser = require('body-parser')
const expressWinston = require('express-winston')
const winston = require('winston')
const swaggerUi = require('swagger-ui-express')
const debug = require('debug')('botium-speech-processing-server')

const { router, wssUpgrade } = require('./routes')

const app = express()
const port = process.env.PORT || 56000

const apiTokens = (process.env.BOTIUM_API_TOKENS && process.env.BOTIUM_API_TOKENS.split(/[\s,]+/)) || []
if (apiTokens.length === 0) {
  console.log('WARNING: BOTIUM_API_TOKENS not set, all clients will be accepted')
} else {
  console.log('Add BOTIUM_API_TOKEN header to all HTTP requests, or BOTIUM_API_TOKEN URL parameter')
}

app.use(bodyParser.json())
app.use(bodyParser.text())
app.use(bodyParser.raw({ type: 'audio/*', limit: process.env.BOTIUM_SPEECH_UPLOAD_LIMIT }))
app.use(bodyParser.urlencoded({ extended: false }))
if (debug.enabled) {
  app.use(expressWinston.logger({
    transports: [
      new winston.transports.Console()
    ],
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
    meta: false
  }))
}

app.use('/api/*', (req, res, next) => {
  const clientApiToken = req.headers.BOTIUM_API_TOKEN || req.headers.botium_api_token || req.query.BOTIUM_API_TOKEN || req.query.botium_api_token || req.body.BOTIUM_API_TOKEN || req.body.botium_api_token

  if (apiTokens.length === 0 || apiTokens.indexOf(clientApiToken) >= 0) {
    next()
  } else {
    debug('client not authenticated, wrong api token or api token not given')
    const err = new Error('BOTIUM_API_TOKEN invalid - add BOTIUM_API_TOKEN header to all HTTP requests, or BOTIUM_API_TOKEN URL parameter')
    err.code = 401
    next(err)
  }
})

app.get('/swagger.json', (req, res) => {
  res.json(require('./swagger.json'))
})
app.get('/', (req, res) => {
  res.redirect('/api-docs')
})
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(require('./swagger.json')))

app.use('/', router)
app.use((err, req, res, next) => {
  debug(`request failed: ${err}`)

  if (err.message) res.statusMessage = err.message

  res.status(err.code || 500)
    .json({
      status: 'error',
      message: err.message ? err.message : err
    })
})

const server = createServer(app)
server.on('upgrade', (req, socket, head) => {
  try {
    wssUpgrade(req, socket, head)
  } catch (err) {
    socket.write('HTTP/1.1 401 Web Socket Protocol Handshake\r\n' +
      'Upgrade: WebSocket\r\n' +
      'Connection: Upgrade\r\n' +
      '\r\n')
    socket.destroy()
  }
})

server.listen(port, function () {
  console.log(`Botium Speech Processing Frontend service running on port ${port}`)
  console.log('Swagger UI available at /')
  console.log('Swagger definition available at /swagger.json')
})
