const fs = require('fs')
const path = require('path')
const Mustache = require('mustache')
const { v1: uuidv1 } = require('uuid')
const { runShellCommand, getSoxFileType, isBufferMP3, getAudioLengthSeconds } = require('../soxi')
const debug = require('debug')('botium-speech-processing-convert')

const TIMECODE = /^([0-5]\d):([0-5]\d)$/

const normalizeTimecode = (value, name) => {
  if (value === undefined || value === null || value === '') return null
  const match = TIMECODE.exec(String(value))
  if (!match) throw new Error(`${name} must be a timecode mm:ss`)
  return `${match[1]}:${match[2]}`
}

const safeFileToken = (value) => {
  const token = path.basename(String(value || ''))
  if (!token || token !== value || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(token)) return null
  return token
}

const pcmtowav = async (inputBuffer, { sampleRate = 16000, bitDepth = 16, channelCount = 1 }) => {
  const result = await runconvert(`sox -r ${sampleRate} -e signed -b ${bitDepth} -c ${channelCount} {{{input}}} {{{output}}}`, 'output.wav', { inputBuffer, inputType: 'raw' })
  return result.outputBuffer
}

const runconvert = async (cmdLine, outputName, { inputBuffer, inputType, start, end }) => {
  const trimStart = normalizeTimecode(start, 'start')
  const trimEnd = normalizeTimecode(end, 'end')
  const safeOutputName = outputName == null || outputName === '' ? null : safeFileToken(outputName)
  if (outputName && !safeOutputName) throw new Error('conversion output name is invalid')

  const jobId = uuidv1()

  const writeInput = !outputName || cmdLine.indexOf('{{{input}}}') >= 0 || cmdLine.indexOf('{{{inputtype}}}') >= 0

  let input = null
  let inputtype = inputType || null

  if (writeInput) {
    input = `${process.env.BOTIUM_SPEECH_TMP_DIR || '/tmp'}/${jobId}_input`
    try {
      fs.writeFileSync(input, inputBuffer)
    } catch (err) {
      debug(`conversion process input file ${input} not writable: ${err.message}`)
      throw new Error('conversion process input file not writable')
    }
    if (!inputtype) {
      if (isBufferMP3(inputBuffer)) {
        inputtype = 'mp3'
      } else {
        try {
          inputtype = await getSoxFileType(input)
          debug(`Identified input type: ${inputtype}`)
        } catch (err) {
          debug(`identification of input file type ${input} failed: ${err.message}`)
          throw new Error('identification of input file type failed')
        }
      }
    }
    if (inputtype && !safeFileToken(inputtype)) {
      throw new Error('identification of input file type failed')
    }
    if (inputtype) {
      try {
        fs.renameSync(input, `${input}.${inputtype}`)
        input = `${input}.${inputtype}`
      } catch (err) {
        debug(`renaming of input file ${input} with extension ${inputtype} failed: ${err.message}`)
      }
    }
    if (!safeOutputName) {
      const typeToken = safeFileToken(inputtype)
      if (!typeToken) throw new Error('identification of input file type failed')
      outputName = `output.${typeToken}`
    } else {
      outputName = safeOutputName
    }
  } else if (safeOutputName) {
    outputName = safeOutputName
  }
  const output = `${process.env.BOTIUM_SPEECH_TMP_DIR || '/tmp'}/${jobId}_${outputName}`

  const soundsdir = process.env.BOTIUM_SPEECH_SOUNDS_DIR || path.resolve(process.cwd(), 'resources/sounds')
  let cmdLineFull = Mustache.render(cmdLine, { output, input, inputtype, soundsdir })
  if (trimStart && trimEnd) {
    cmdLineFull = `${cmdLineFull} trim ${trimStart} ${trimEnd}`
  } else if (trimStart) {
    cmdLineFull = `${cmdLineFull} trim ${trimStart}`
  } else if (trimEnd) {
    cmdLineFull = `${cmdLineFull} trim 0 ${trimEnd}`
  }
  debug(`cmdLineFull: ${cmdLineFull}`)

  try {
    await runShellCommand(cmdLineFull, cmdLine.indexOf('{{{input}}}') < 0 ? inputBuffer : null)

    let outputBuffer = null
    let outputDuration = null
    try {
      outputDuration = await getAudioLengthSeconds(output)
    } catch (err) {
      debug(`no audio length readable for ${output}: ${err.message}`)
    }
    try {
      outputBuffer = fs.readFileSync(output)
      fs.unlinkSync(output)
    } catch (err) {
      throw new Error(`conversion process output file ${output} not readable: ${err.message}`)
    }
    return {
      outputName,
      outputBuffer,
      outputDuration
    }
  } finally {
    if (input) {
      try {
        fs.unlinkSync(input)
      } catch (err) {
        debug(`conversion process input file ${input} not deleted: ${err.message}`)
      }
    }
  }
}

module.exports = {
  pcmtowav,
  runconvert
}
