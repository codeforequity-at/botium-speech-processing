const fs = require('fs')
const _ = require('lodash')
const axios = require('axios').default
const { WebSocket } = require('ws')

const sampleBuffer = fs.readFileSync('sample.raw')
const playCount = 1
const showInterim = false

const main = async () => {

  const { data } = await axios.get('http://localhost:56000/api/sttstream/en?stt=kaldi')
  const ws = new WebSocket(data.wsUri)

  ws.on('open', () => {
    for (let i = 0; i < playCount; i++) {
      setTimeout(() => _.chunk(sampleBuffer, 10000).forEach(c => ws.send(Buffer.from(c))), i * 1000)
    }
    setTimeout(() => axios.get(data.endUri), 3000 + playCount * 1000)
    setTimeout(() => ws.close(), 5000 + playCount * 1000)
  })

  ws.on('message', (data) => {
    try {
      const dj = JSON.parse(data)
      if (showInterim || dj.final) console.log('received: %s', dj.text)
    } catch (err) {
    }
  })
}
main()