const fs = require('fs')
const express = require('express')

const app = express()
const port = process.env.PORT || 56100
const dictateDir = process.env.DICTATEDIR || './dictate.js-master'

const wsScript = `
  var sttUrlDe = new URL('/stt-de', window.location.href);
  sttUrlDe.protocol = sttUrlDe.protocol.replace('http', 'ws');
  var sttUrlEn = new URL('/stt-en', window.location.href);
  sttUrlEn.protocol = sttUrlEn.protocol.replace('http', 'ws');
  
  var serversElement = document.getElementById('servers')
  serversElement.options[0] = new Option("English", sttUrlEn.href + "/client/ws/speech|" + sttUrlEn.href + "/client/ws/status", true, false)
  serversElement.options[1] = new Option("German", sttUrlDe.href + "/client/ws/speech|" + sttUrlDe.href + "/client/ws/status", false, false)
`

app.get('/demos/mob.html', (req, res) => {
  let mobHtml = fs.readFileSync(`${dictateDir}/demos/mob.html`, { encoding: 'utf-8' })

  mobHtml = mobHtml.replace(
    '<script src="mob.js"></script>',
    `<script src="mob.js"></script><script>${wsScript}</script>`
  )

  res.header('Content-Type', 'text/html')
  res.send(mobHtml)
})

app.get('/', (req, res) => {
  res.redirect('/dictate/demos/mob.html')
})

app.use(express.static(dictateDir))

app.listen(port, function () {
  console.log(`Botium Speech Processing Dictate service running on port ${port}`)
})

