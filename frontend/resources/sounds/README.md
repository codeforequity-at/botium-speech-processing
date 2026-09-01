# Background scene sounds

These files are mixed into voice audio by the conversion profiles in
`resources/.env`. The committed files are normalized to mono, 16 kHz,
16-bit PCM WAV and peak-normalized to -3 dBFS. Run `normalize-sounds.sh`
to reproduce them from the original downloads in the ignored `source/`
directory.

`mix-background.sh` repeats or trims a scene to the voice recording length
and mixes it at 20 percent volume. Scene classification and user-facing
names deliberately live in Botium Box; Speech Processing only exposes the
stable conversion-profile keys and descriptions.

## Sources and licenses

The links below are the authoritative source pages. All sounds are licensed
under Creative Commons Zero (CC0 1.0), except `STEADYRAIN.wav` and
`WINDSHIELDWIPERS.wav`, which are licensed under Creative Commons
Attribution 4.0 (CC BY 4.0).

| Output file | Original sound and author | License |
| --- | --- | --- |
| `OFFICEAMBIENCE.wav` | [Office Ambience by DiArchangeli](https://freesound.org/s/108695/) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `IDLINGENGINE.wav` | [engine2_idle_loop2.wav by ReadeOnly](https://freesound.org/s/186936/) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `CARTURNSIGNAL.wav` | [Car Turn Signal Blinker Left and Right by ProductionNow](https://freesound.org/s/195994/) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `CHILDRENCHATTER.wav` | [kids group by tsuenh](https://freesound.org/s/331389/) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `CAFEAMBIENCE.wav` | [Cafe Ambience Day 3 by lunchmoney](https://freesound.org/s/380200/) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `RADIOTUNING.wav` | [Live Radio Recording by waveplaySFX](https://freesound.org/s/397000/) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `SCHOOLAMBIENCE.wav` | [school.wav by Univ_Lyon3](https://freesound.org/s/410802/) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `STREETTRAFFIC.wav` | [Ambient Street Noise by jackthemurray](https://freesound.org/s/429397/) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `FASTFOODRESTAURANT.wav` | [In N Out Burgers, Burbank, California by Courter](https://freesound.org/s/467448/) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `SHOPPINGCENTERCROWD.wav` | [Ambiance Crowd Shopping Center by Nox_Sound](https://freesound.org/s/473576/) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `GROCERYSTORE.wav` | [Grocery Store Ambiance by theblockofsound235](https://freesound.org/s/486592/) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `CELLPHONEINTERFERENCE.wav` | [Cell Phone Interference Noise 1 by RutgerMuller](https://freesound.org/s/50699/) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `BUSTLINGCAFE.wav` | [Bustling Cafe Ambience by Talitha5](https://freesound.org/s/509950/) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `PASSINGRAIN.wav` | [Rain Slowly Passing by speakwithanimals](https://freesound.org/s/525046/) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `SUPER8FILMCAMERA.wav` | [Super 8mm Film Camera by bmacphail](https://freesound.org/s/569532/) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `STEADYRAIN.wav` | [Rain Loop by chris5s](https://freesound.org/s/595879/) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `CITYNEARSCHOOL.wav` | [City Ambiance Near School by ValentinPetiteau](https://freesound.org/s/608208/) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `AIRPORTAMBIENCE.wav` | [Ambience Spaced Out Airport Loop by DigitalUnderglow](https://freesound.org/s/690546/) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `ELECTRICTRAINIDLE.wav` | [Electric Train Motor Idle Loop by JotrainG](https://freesound.org/s/700034/) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `WINDSHIELDWIPERS.wav` | [winshield_wipers_01.wav by joedeshon](https://freesound.org/s/81827/) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

`STEADYRAIN.wav` and `WINDSHIELDWIPERS.wav` are resampled, mono,
peak-normalized adaptations of the linked recordings. Credits: “Rain Loop”
by chris5s and “winshield_wipers_01.wav” by joedeshon, both licensed under
CC BY 4.0.
