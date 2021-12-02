const fs = require('fs')
const axios = require('axios').default
const { WebSocket } = require('ws')

const sampleBuffer = fs.readFileSync('sample.wav')

const main = async () => {

  const { data } = await axios.get('http://localhost:56000/api/sttstream/en-US?stt=ibm')
  const ws = new WebSocket(data.wsUri)

  ws.on('open', () => {
    for (let i = 0; i < 5; i++) {
      setTimeout(() => ws.send(sampleBuffer), i * 1000)
    }
    setTimeout(() => ws.close(), 20000)
  })

  ws.on('message', (data) => {
    console.log('received: %s', data);
  })
}
main()