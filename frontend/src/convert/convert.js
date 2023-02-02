const fs = require('fs')
const Mustache = require('mustache')
const { v1: uuidv1 } = require('uuid')
const { runShellCommand, getSoxFileType, isBufferMP3, getAudioLengthSeconds } = require('../soxi')
const debug = require('debug')('botium-speech-processing-convert')

const pcmtowav = async (inputBuffer, { sampleRate = 16000, bitDepth = 16, channelCount = 1 }) => {
  const result = await runconvert(`sox -r ${sampleRate} -e signed -b ${bitDepth} -c ${channelCount} {{{input}}} {{{output}}}`, 'output.wav', { inputBuffer, inputType: 'raw' })
  return result.outputBuffer
}

const runconvert = async (cmdLine, outputName, { inputBuffer, inputType, start, end }) => {
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
    if (inputtype) {
      try {
        fs.renameSync(input, `${input}.${inputtype}`)
        input = `${input}.${inputtype}`
      } catch (err) {
        debug(`renaming of input file ${input} with extension ${inputtype} failed: ${err.message}`)
      }
    }
    if (!outputName) {
      outputName = `output.${inputtype}`
    }
  }
  const output = `${process.env.BOTIUM_SPEECH_TMP_DIR || '/tmp'}/${jobId}_${outputName}`

  let cmdLineFull = Mustache.render(cmdLine, { output, input, inputtype })
  if (start && end) {
    cmdLineFull = `${cmdLineFull} trim ${start} ${end}`
  } else if (start && !end) {
    cmdLineFull = `${cmdLineFull} trim ${start}`
  } else if (!start && end) {
    cmdLineFull = `${cmdLineFull} trim 0 ${end}`
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
