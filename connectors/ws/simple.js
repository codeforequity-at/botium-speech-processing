const fs = require('fs')
const _ = require('lodash')
const axios = require('axios').default
const { WebSocket } = require('ws')

const sampleBuffer = fs.readFileSync('sample.wav')

const main = async () => {

  const { data } = await axios.get('http://localhost:56000/api/sttstream/en-US?stt=google')
  const ws = new WebSocket(data.wsUri)

  ws.on('open', () => {
    ws.send(sampleBuffer)
    setTimeout(() => axios.get(data.endUri), 3000)
    setTimeout(() => ws.close(), 5000)
  })

  ws.on('message', (data) => {
    try {
      const dj = JSON.parse(data)
      if (dj.final) console.log('received %s-%s: %s ', dj.start, dj.end, dj.text)
    } catch (err) {
    }
  })
}
main().catch(err => console.error(err.message))