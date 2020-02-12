const speechScorer = require('word-error-rate')

const wer = async (text1, text2) => {
  return {
    distance: speechScorer.calculateEditDistance(text1 || '', text2 || ''),
    wer: speechScorer.wordErrorRate(text1 || '', text2 || '')
  }
}

module.exports = {
  wer
}