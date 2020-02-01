const fs = require('fs')
const express = require('express')

const app = express()
app.disable('etag')
app.set('trust proxy', true)
const port = process.env.PORT || 56100
const dictateDir = process.env.DICTATEDIR || './dictate.js'

app.get('/demos/mob.html', (req, res) => {
  let mobHtml = fs.readFileSync(`${dictateDir}/demos/mob.html`, { encoding: 'utf-8' })

  const wsProtocol = (req.protocol === 'https' ? 'wss:' : 'ws:')
  const sttUrlDe = process.env.STT_URL_DE || `${wsProtocol}//${req.hostname}/stt_de`
  const sttUrlEn = process.env.STT_URL_EN || `${wsProtocol}//${req.hostname}/stt_en`

  mobHtml = mobHtml.replace(
    '<option value="wss://bark.phon.ioc.ee:8443/dev/duplex-speech-api/ws/speech|wss://bark.phon.ioc.ee:8443/dev/duplex-speech-api/ws/status">eesti keel</option>',
    `<option value="${sttUrlDe}/client/ws/speech|${sttUrlDe}/client/ws/status">German</option>`
  )
  mobHtml = mobHtml.replace(
    '<option value="wss://bark.phon.ioc.ee:8443/english/duplex-speech-api/ws/speech|wss://bark.phon.ioc.ee:8443/english/duplex-speech-api/ws/status" selected="selected">English</option>',
    `<option value="${sttUrlEn}/client/ws/speech|${sttUrlEn}/client/ws/status" selected="selected">English</option>`
  )

  res.header('Content-Type', 'text/html')
  res.send(mobHtml)
})

app.get('/', (req, res) => {
  res.redirect('./demos/mob.html')
})

app.use(express.static(dictateDir))

app.listen(port, function () {
  console.log(`Botium Speech Processing Dictate service running on port ${port}`)
})

