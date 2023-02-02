const _ = require('lodash')
const { PollyClient, DescribeVoicesCommand, SynthesizeSpeechCommand } = require('@aws-sdk/client-polly')
const debug = require('debug')('botium-speech-processing-polly-tts')

const { pollyOptions, ttsFilename } = require('../utils')
const { pcmtowav } = require('../convert/convert')

const genderMap = {
  Male: 'male',
  Female: 'female'
}

class PollyTTS {
  async voices (req) {
    const pollyClient = new PollyClient(pollyOptions(req))

    const voices = await pollyClient.send(new DescribeVoicesCommand({}))

    const pollyVoices = []
    voices.Voices.forEach(voice => {
      pollyVoices.push({
        name: voice.Id,
        gender: genderMap[voice.Gender],
        language: voice.LanguageCode
      })
    })
    return pollyVoices
  }

  async languages (req) {
    const voicesList = await this.voices(req)
    return _.uniq(voicesList.map(v => v.language)).sort()
  }

  async tts (req, { language, voice, text }) {
    const pollyClient = new PollyClient(pollyOptions(req))

    if (!voice) {
      const voicesList = await this.voices(req)
      voice = voicesList.find(v => v.language === language).name
    }

    const synthesizeParams = {
      OutputFormat: 'pcm',
      Text: text,
      LanguageCode: language,
      VoiceId: voice
    }

    if (req.body.polly && req.body.polly.config) {
      Object.assign(synthesizeParams, req.body.polly.config)
    }

    try {
      const synthResult = await pollyClient.send(new SynthesizeSpeechCommand(synthesizeParams))

      const chunks = []
      for await (const chunk of synthResult.AudioStream) {
        chunks.push(chunk)
      }
      const bufferRaw = Buffer.concat(chunks)
      if (synthesizeParams.OutputFormat === 'pcm') {
        const bufferWav = await pcmtowav(bufferRaw, { sampleRate: 16000, bitDepth: 16, channelCount: 1 })
        return {
          buffer: bufferWav,
          name: `${ttsFilename(text)}.wav`
        }
      } else if (synthesizeParams.OutputFormat === 'mp3') {
        return {
          buffer: bufferRaw,
          name: `${ttsFilename(text)}.mp3`
        }
      } else if (synthesizeParams.OutputFormat === 'ogg_vorbis') {
        return {
          buffer: bufferRaw,
          name: `${ttsFilename(text)}.ogg`
        }
      }
    } catch (err) {
      debug(err)
      throw new Error(`Polly TTS failed: ${err.message}`)
    }
  }
}

module.exports = PollyTTS
