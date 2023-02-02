const path = require('path')
const { nanoid } = require('nanoid')
const cors = require('cors')
const axios = require('axios')
const app = require('express')()
const http = require('http').Server(app)
const io = require('socket.io')(http)

const SAPCAI_TOKEN = process.env.SAPCAI_TOKEN

app.use(cors())

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'))
})

io.on('connection', (socket) => {
  console.log('user connected')
  socket.on('disconnect', () => {
    console.log('user disconnected')
  })
  socket.on('session_request', (msg) => {
    console.log('session_request', msg)
    if (msg && msg.session_id) {
      socket.emit('session_confirm', { session_id: msg.session_id })
    } else {
      socket.emit('session_confirm', { session_id: nanoid() })
    }
  })
  socket.on('user_uttered', async (msg) => {
    if (msg && msg.message) {
      let textInput = msg.message

      if (msg.message.startsWith('data:')) {
        console.log('user_uttered audio')

        const base64Data = msg.message.substring(msg.message.indexOf(',') + 1)
        const audioData = Buffer.from(base64Data, 'base64')
        console.log(`Received data length ${audioData.length}`)

        const wavToMonoWavRequestOptions = {
          method: 'POST',
          url: 'https://speech.botiumbox.com/api/convert/WAVTOMONOWAV',
          data: audioData,
          headers: {
            'content-type': 'audio/wav'
          },
          responseType: 'arraybuffer'
        }
        const wavToMonoWavResponse = await axios(wavToMonoWavRequestOptions)
        console.log(`Converted to mono wav length ${wavToMonoWavResponse.data.length}`)

        const sttRequestOptions = {
          method: 'POST',
          url: 'https://speech.botiumbox.com/api/stt/en',
          data: wavToMonoWavResponse.data,
          headers: {
            'content-type': 'audio/wav'
          },
          responseType: 'json'
        }
        const sttResponse = await axios(sttRequestOptions)
        console.log('sttResponse', JSON.stringify(sttResponse.data, null, 2))

        textInput = sttResponse.data.text
      } else {
        console.log('user_uttered text', msg)
      }

      const requestOptions = {
        method: 'POST',
        url: 'https://api.cai.tools.sap/build/v1/dialog',
        headers: {
          Authorization: `Token ${SAPCAI_TOKEN}`
        },
        data: {
          message: {
            type: 'text',
            content: textInput
          },
          conversation_id: msg.session_id || nanoid()
        }
      }
      try {
        const response = await axios(requestOptions)
        console.log('sap response', JSON.stringify(response.data, null, 2))

        for (const message of response.data.results.messages.filter(t => t.type === 'text')) {
          const botUttered = {
            text: message.content.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g, '')
          }

          const ttsRequestOptions = {
            method: 'GET',
            url: 'https://speech.botiumbox.com/api/tts/en',
            params: {
              text: message.content,
              voice: 'dfki-poppy-hsmm'
            },
            responseType: 'arraybuffer'
          }
          const ttsResponse = await axios(ttsRequestOptions)
          botUttered.link = 'data:audio/wav;base64,' + Buffer.from(ttsResponse.data, 'binary').toString('base64')

          socket.emit('bot_uttered', botUttered)
        }
      } catch (err) {
        console.log(err.message)
      }
    }
  })
})

const port = process.env.PORT || 5005
http.listen(port, () => {
  console.log('listening on *:' + port)
})
