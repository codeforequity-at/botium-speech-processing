const _ = require('lodash')
const { createClient } = require('@deepgram/sdk')
const axios = require('axios')
const debug = require('debug')('botium-speech-processing-deepgram-tts')

const { deepgramOptions, ttsFilename } = require('../utils')

class DeepgramTTS {
  async _fetchVoicesFromDocs() {
    try {
      // Fetch Deepgram TTS documentation page
      const response = await axios.get('https://developers.deepgram.com/docs/tts-models', {
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      })
      
      const html = response.data
      const voices = []
      
      // Parse voice models from documentation
      // Look for patterns like "aura-2-asteria-en" (only Aura-2 generation)
      const voicePattern = /aura-2-([a-z]+)-([a-z]{2,3})/g
      let match
      
      while ((match = voicePattern.exec(html)) !== null) {
        console.log(match)
        const fullMatch = match[0] // Full match like "aura-2-asteria-en"
        const name = fullMatch
        const voiceName = match[1] // asteria
        const language = match[2] // en
        
        // Determine gender based on common name patterns
        const femaleNames = ['asteria', 'luna', 'stella', 'athena', 'hera', 'esperanza', 'ramona', 'margot', 'claire', 'liesel', 'greta', 'lucia', 'sofia', 'valentina', 'giulia', 'hina', 'yuki', 'yuna', 'soo', 'xiaoxiao', 'mei', 'nova', 'emma', 'klara', 'katya', 'natasha', 'zeynep', 'maya', 'astrid', 'ingrid', 'maja', 'aino', 'oksana', 'tereza', 'zsofia', 'elena', 'maria', 'ana', 'milica', 'jana', 'meta', 'ausra', 'liga', 'kadri', 'sarah', 'layla', 'siriporn', 'linh', 'sari', 'siti', 'priya', 'rashida', 'fatima', 'maryam', 'amara']
        
        const gender = femaleNames.includes(voiceName) ? 'female' : 'male'
        
        voices.push({ name, gender, language })
      }
      
      // Remove duplicates
      const uniqueVoices = _.uniqBy(voices, 'name')
      
      // Filter out non-existent languages (keep only valid ISO codes)
      const validLanguages = [
        'ar', 'bg', 'bn', 'cs', 'da', 'de', 'el', 'en', 'es', 'et', 
        'fa', 'fi', 'fr', 'he', 'hi', 'hr', 'hu', 'id', 'it', 'ja', 
        'ko', 'lt', 'lv', 'ms', 'nl', 'no', 'pl', 'pt', 'ro', 'ru', 
        'sk', 'sl', 'sr', 'sv', 'sw', 'ta', 'th', 'tr', 'uk', 'ur', 
        'vi', 'zh'
      ]
      
      const filteredVoices = uniqueVoices.filter(voice => 
        validLanguages.includes(voice.language)
      )
      
      debug(`Fetched ${filteredVoices.length} voices with valid languages from Deepgram documentation`)
      return filteredVoices.length > 0 ? filteredVoices : null
      
    } catch (err) {
      debug(`Failed to fetch voices from documentation: ${err.message}`)
      return null
    }
  }

  async voices (req) {
    // Try to fetch from documentation first
    const docVoices = await this._fetchVoicesFromDocs()
    if (docVoices && docVoices.length > 0) {
      return docVoices
    }
    
    // Fallback to static list if documentation parsing fails  
    debug('Using fallback static voice list (Aura-2 only)')
    return [
      // English voices (Aura-2)
      { name: 'aura-2-asteria-en', gender: 'female', language: 'en' },
      { name: 'aura-2-luna-en', gender: 'female', language: 'en' },
      { name: 'aura-2-stella-en', gender: 'female', language: 'en' },
      { name: 'aura-2-athena-en', gender: 'female', language: 'en' },
      { name: 'aura-2-hera-en', gender: 'female', language: 'en' },
      { name: 'aura-2-orion-en', gender: 'male', language: 'en' },
      { name: 'aura-2-arcas-en', gender: 'male', language: 'en' },
      { name: 'aura-2-perseus-en', gender: 'male', language: 'en' },
      { name: 'aura-2-angus-en', gender: 'male', language: 'en' },
      { name: 'aura-2-orpheus-en', gender: 'male', language: 'en' },
      { name: 'aura-2-helios-en', gender: 'male', language: 'en' },
      { name: 'aura-2-zeus-en', gender: 'male', language: 'en' }
    ]
  }

  async languages (req) {
    const voicesList = await this.voices(req)
    return _.uniq(voicesList.map(v => v.language)).sort()
  }

  async tts (req, { language, voice, text }) {
    const options = deepgramOptions(req)
    if (!options.apiKey) {
      throw new Error('Deepgram API key not configured')
    }

    const deepgram = createClient(options.apiKey)
    
    const speakOptions = {
      model: voice || 'aura-2-asteria-en',
      encoding: 'linear16',
      sample_rate: 16000
    }

    // Apply default config from environment
    if (process.env.BOTIUM_SPEECH_DEEPGRAM_TTS_CONFIG) {
      try {
        const defaultConfig = JSON.parse(process.env.BOTIUM_SPEECH_DEEPGRAM_TTS_CONFIG)
        Object.assign(speakOptions, defaultConfig)
      } catch (err) {
        throw new Error(`Deepgram TTS config in BOTIUM_SPEECH_DEEPGRAM_TTS_CONFIG invalid: ${err.message}`)
      }
    }

    // Apply request-specific config
    if (req.body && req.body.deepgram && req.body.deepgram.config) {
      Object.assign(speakOptions, req.body.deepgram.config)
    }

    try {
      debug(`Calling Deepgram TTS API with options: ${JSON.stringify(speakOptions)}`)
      
      const response = await deepgram.speak.request(
        { text },
        speakOptions
      )

      // Get the audio stream
      const stream = await response.getStream()
      if (!stream) {
        throw new Error('No audio stream received from Deepgram')
      }

      // Convert stream to buffer
      const chunks = []
      for await (const chunk of stream) {
        chunks.push(chunk)
      }
      const buffer = Buffer.concat(chunks)

      debug(`Deepgram TTS response received, buffer size: ${buffer.length}`)

      return {
        buffer: buffer,
        name: `${ttsFilename(text)}.wav`
      }
    } catch (err) {
      debug(err)
      throw new Error(`Deepgram TTS failed: ${err.message || err}`)
    }
  }
}

module.exports = DeepgramTTS