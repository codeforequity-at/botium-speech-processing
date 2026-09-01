#!/bin/sh

set -eu

SOUNDS_SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SOUNDS_SOURCE_DIR=${1:-"$SOUNDS_SCRIPT_DIR/source"}
SOUNDS_OUTPUT_DIR=${2:-"$SOUNDS_SCRIPT_DIR"}

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg is required to normalize the background sounds" >&2
  exit 1
fi

normalize_sound() {
  source_name=$1
  output_name=$2
  source_path="$SOUNDS_SOURCE_DIR/$source_name"
  output_path="$SOUNDS_OUTPUT_DIR/$output_name"
  intermediate_path="$output_path.intermediate.wav"

  if [ ! -f "$source_path" ]; then
    echo "Source sound not found: $source_path" >&2
    exit 1
  fi

  echo "Normalizing $source_name -> $output_name"
  ffmpeg -hide_banner -loglevel error -y -i "$source_path" \
    -vn -ar 16000 -ac 1 -c:a pcm_s16le "$intermediate_path"

  max_volume=$(ffmpeg -hide_banner -nostats -i "$intermediate_path" \
    -af volumedetect -f null /dev/null 2>&1 \
    | sed -n 's/.*max_volume: \([-0-9.]*\) dB.*/\1/p' \
    | tail -n 1)

  if [ -z "$max_volume" ]; then
    rm -f "$intermediate_path"
    echo "Unable to determine peak volume for $source_name" >&2
    exit 1
  fi

  gain=$(awk -v peak="$max_volume" 'BEGIN { printf "%.2f", -3.0 - peak }')
  ffmpeg -hide_banner -loglevel error -y -i "$intermediate_path" \
    -af "volume=${gain}dB" -ar 16000 -ac 1 -c:a pcm_s16le "$output_path"
  rm -f "$intermediate_path"
}

mkdir -p "$SOUNDS_OUTPUT_DIR"

normalize_sound "108695__diarchangeli__office-ambience.wav" "OFFICEAMBIENCE.wav"
normalize_sound "186936__readeonly__engine2_idle_loop2.wav" "IDLINGENGINE.wav"
normalize_sound "195994__productionnow__car-turn-signal-blinker-left-and-right.wav" "CARTURNSIGNAL.wav"
normalize_sound "331389__tsuenh__kids-group.wav" "CHILDRENCHATTER.wav"
normalize_sound "380200__lunchmoney__cafe-ambience-day-3-sound-devices-702-senn-k6.wav" "CAFEAMBIENCE.wav"
normalize_sound "397000__waveplaysfx__live-radio-recording-scanning-through-various-freqs.wav" "RADIOTUNING.wav"
normalize_sound "410802__univ_lyon3__renard_orane_2017_2018_school.wav" "SCHOOLAMBIENCE.wav"
normalize_sound "429397__jackthemurray__ambient-street-noise-cars-passing.wav" "STREETTRAFFIC.wav"
normalize_sound "467448__courter__in-n-out-burgers-burbank-california.wav" "FASTFOODRESTAURANT.wav"
normalize_sound "473576__nox_sound__ambiance_crowd_shopping_center_stereo.wav" "SHOPPINGCENTERCROWD.wav"
normalize_sound "486592__theblockofsound235__grocery-store-ambiance.mp3" "GROCERYSTORE.wav"
normalize_sound "50699__rutgermuller__cell-phone-interference-noise-1.wav" "CELLPHONEINTERFERENCE.wav"
normalize_sound "509950__talitha5__bustling-cafe-ambience.m4a" "BUSTLINGCAFE.wav"
normalize_sound "525046__speakwithanimals__rain-slowly-passing-treated-loop_edgewater_06192020.wav" "PASSINGRAIN.wav"
normalize_sound "569532__bmacphail__super-8mm-film-camera-rolling-and-stop.wav" "SUPER8FILMCAMERA.wav"
normalize_sound "595879__chris5s__rain-loop.wav" "STEADYRAIN.wav"
normalize_sound "608208__valentinpetiteau__city-ambiance-near-school.wav" "CITYNEARSCHOOL.wav"
normalize_sound "690546__digitalunderglow__ambience_spaced-out-airport-loop.wav" "AIRPORTAMBIENCE.wav"
normalize_sound "700034__jotraing__electric-train-motor-idle-loop-queensland-rail-intercity-express.wav" "ELECTRICTRAINIDLE.wav"
normalize_sound "81827__joedeshon__winshield_wipers_01.wav" "WINDSHIELDWIPERS.wav"
