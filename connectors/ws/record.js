const recorder = require('node-record-lpcm16')
const axios = require('axios').default
const { WebSocket } = require('ws')

const main = async () => {

  const { data } = await axios.get('http://localhost:56000/api/sttstream/en?stt=kaldi')
  const ws = new WebSocket(data.wsUri)

  ws.on('open', () => {
    recorder
    .record({
      sampleRateHertz: 16000,
      threshold: 0, //silence threshold
      recordProgram: 'rec', // Try also "arecord" or "sox"
      silence: '5.0', //seconds of silence before ending
    })
    .stream()
    .on('error', console.error)
    .on('data', (data) => ws.send(data))
  })

  ws.on('message', (data) => {
    console.log('received: %s', data);
  })
}
main()