#!/usr/bin/env node

const WebSocket = require('ws')
const axios = require('axios')
const fs = require('fs')

// Configuration
const BASE_URL = 'http://127.0.0.1:56000'
const LANGUAGE = 'en'
const TTS_PROVIDER = 'azure'
const VOICE = 'en-US-JennyNeural'

const TEST_TEXT = "Hello, this is a test of TTS streaming. This text will be sent in chunks to demonstrate real-time synthesis."

async function testTTSStreaming() {
  console.log('🚀 Testing TTS Streaming')
  console.log(`Provider: ${TTS_PROVIDER}, Language: ${LANGUAGE}, Voice: ${VOICE}`)
  
  try {
    // 1. Open streaming session
    console.log('📡 Opening stream...')
    const response = await axios.post(`${BASE_URL}/api/ttsstream/${LANGUAGE}?tts=${TTS_PROVIDER}&voice=${VOICE}`)
    const { wsUri, endUri } = response.data
    console.log('✅ Stream opened:', wsUri)

    // 2. Connect WebSocket
    const ws = new WebSocket(wsUri)
    let wavHeader = null
    let pcmChunks = []

    ws.on('open', () => {
      console.log('🔌 WebSocket connected')
      console.log('📋 Event: WebSocket opened')
      
      // Send text in chunks
      const words = TEST_TEXT.split(' ')
      let i = 0
      const sendChunk = () => {
        if (i < words.length) {
          const chunk = words.slice(i, i + 3).join(' ') + ' '
          console.log(`📤 Sending: "${chunk.trim()}"`)
          ws.send(chunk)
          i += 3
          setTimeout(sendChunk, 1000)
        } else {
          console.log('📤 All text sent, ending stream...')
          // End the stream and close WebSocket
          setTimeout(async () => {
            try {
              await axios.get(endUri)
              console.log('📡 Stream ended via API')
            } catch (err) {
              console.log('⚠️ End API call failed:', err.message)
            }
            
            // Force close WebSocket after a delay to receive final audio
            setTimeout(() => {
              if (ws.readyState === WebSocket.OPEN) {
                console.log('🔌 Closing WebSocket...')
                ws.close()
              }
            }, 2000)
          }, 1000)
        }
      }
      setTimeout(sendChunk, 500)
    })

    ws.on('message', (data) => {
      if (Buffer.isBuffer(data)) {
        // Check if it's a WAV header or PCM data
        if (data.length === 44 && data.toString('ascii', 0, 4) === 'RIFF') {
          // It's a WAV header
          wavHeader = data
          console.log(`📄 WAV header received: ${data.length} bytes`)
          console.log('📋 Event: WAV header received')
        } else if (data.length > 44 && data.toString('ascii', 0, 4) === 'RIFF') {
          // It's a complete WAV file (fallback for providers that still send complete WAVs)
          const header = data.slice(0, 44)
          const pcm = data.slice(44)
          if (!wavHeader) wavHeader = header
          pcmChunks.push(pcm)
          console.log(`🔊 Complete WAV: ${data.length} bytes (header: 44, PCM: ${pcm.length})`)
          console.log('📋 Event: Complete WAV received')
        } else {
          // It's raw PCM data or JSON metadata
          try {
            const msg = JSON.parse(data.toString())
            console.log(`📋 Metadata: ${msg.status}, Final: ${msg.final}`)
            console.log('📋 Event: Metadata received')
            if (msg.debug) {
              console.log(`   Debug:`, msg.debug)
            }
          } catch (e) {
            // It's raw PCM data
            pcmChunks.push(data)
            console.log(`🔊 PCM chunk: ${data.length} bytes`)
            console.log('📋 Event: PCM chunk received')
          }
        }
      } else {
        try {
          const msg = JSON.parse(data)
          console.log(`📋 Status: ${msg.status}, Final: ${msg.final}`)
          console.log('📋 Event: JSON message received')
          if (msg.debug) {
            console.log(`   Debug:`, msg.debug)
          }
        } catch (e) {
          console.log(`📋 Raw message: ${data.toString()}`)
          console.log('📋 Event: Raw message received')
        }
      }
    })

    ws.on('close', (code, reason) => {
      console.log(`🔌 WebSocket closed: code=${code}, reason=${reason}`)
      console.log('📋 Event: WebSocket closed')
      if (wavHeader && pcmChunks.length > 0) {
        console.log(`🔧 Combining WAV header + ${pcmChunks.length} PCM chunks...`)
        
        // Combine all PCM data 
        const combinedPcm = Buffer.concat(pcmChunks)
        
        // Fix WAV header with actual PCM length
        const correctedHeader = Buffer.from(wavHeader)
        const actualDataSize = combinedPcm.length
        const actualFileSize = 36 + actualDataSize
        
        correctedHeader.writeUInt32LE(actualFileSize, 4)  // Fix ChunkSize
        correctedHeader.writeUInt32LE(actualDataSize, 40) // Fix Subchunk2Size
        
        const finalWav = Buffer.concat([correctedHeader, combinedPcm])
        
        const filename = `tts-test-${TTS_PROVIDER}-${Date.now()}.wav`
        fs.writeFileSync(filename, finalWav)
        
        console.log(`💾 WAV file saved: ${filename}`)
        console.log(`   Header: 44 bytes, PCM: ${combinedPcm.length} bytes, Total: ${finalWav.length} bytes`)
        console.log('✅ Audio should be playable now')
      } else if (wavHeader) {
        console.log('⚠️ WAV header received but no PCM chunks')
      } else if (pcmChunks.length > 0) {
        console.log('⚠️ PCM chunks received but no WAV header')
      } else {
        console.log('⚠️ No audio data received')
      }
      console.log('✅ Test completed')
    })

    ws.on('error', (err) => {
      console.error('❌ WebSocket error:', err.message)
      console.log('📋 Event: WebSocket error')
    })

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message)
  }
}

testTTSStreaming()