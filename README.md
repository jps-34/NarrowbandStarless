# NarrowbandStarless

**A PixInsight script that runs the same linear pipeline on each narrowband master.**
Pick your SII, Ha and OIII images, tick the tools, press *Run*: each channel goes through
GraXpert background extraction, BlurXTerminator, StarXTerminator and NoiseXTerminator, one after
the other, with the same settings. The source images are never modified.

*Version française : [README.fr.md](README.fr.md)*

Built for the author's own workflow (masters from CommonCrop, then this script, then SHO
combination). Shared as is.

## What it does

For each checked channel, on a copy of the selected view:

1. **GraXpert**: AI background extraction. *Replace image* is always on inside the pipeline, so the
   next steps work on the corrected image.
2. **BlurXTerminator**: deconvolution.
3. **StarXTerminator**: star removal (optionally with a separate star image).
4. **NoiseXTerminator**: noise reduction.
5. **Auto STF** (optional, on by default): a linked automatic screen stretch on each result and
   background model, so the results open ready to inspect. Display only: pixels are not changed.
   Star images are left alone (RC Astro advises against auto-stretching them).

Each tool is run on its own (no ProcessContainer), with the time of each step in the console and
*Pause/Abort* honoured between steps. Results are named `Starless_SII`, `Starless_Ha` and
`Starless_OIII` by default (editable). Extra windows are named `Background_<channel>` (GraXpert
*Show background*) and `Stars_<channel>` (StarXTerminator *Generate Star Image*). The copies keep the
FITS keywords and the astrometric solution of their source.

## Requirements

| Item | Version |
|---|---|
| PixInsight | 1.9.4 and later (V8 JavaScript engine) |
| GraXpert process (DeepSkyForge) and GraXpert application | process requires GraXpert 4.0.0 or later |
| BlurXTerminator, StarXTerminator, NoiseXTerminator | RC Astro, licensed separately |

Only the enabled tools need to be installed.

## Installation

### From the PixInsight update repository (recommended)

1. *Resources > Updates > Manage Repositories*, add
   `https://jps-34.github.io/NarrowbandStarless/`
2. *Resources > Updates > Check for Updates*, then restart PixInsight.
3. The script appears under *Script > Utilities > NarrowbandStarless*.

Until the repository is code-signed, PixInsight only accepts it with the *Allow unsigned update
repositories* security preference enabled.

### Manual

Download `scripts/NarrowbandStarless.js`, then either run it with *Script > Execute Script File*, or
add its folder with *Script > Feature Scripts > Add* so it shows up in *Script > Utilities*.

## Quick start

1. Open the three **linear masters with stars** (for example `SII_crop`, `Ha_crop`, `OIII_crop`).
   The script preselects views whose name contains SII, Ha or OIII.
2. Check each channel's image in the *Images* group; untick a channel to skip it.
3. Tick the tools to run. Keep *Work on a copy* on to leave the sources untouched.
4. *Run*. Progress and timings are in the Process Console.

Settings are remembered between sessions. *Reset* restores the defaults and keeps the selected
images. Dragging the *New Instance* triangle to the workspace saves all settings and image names in a
process icon; double-clicking the icon reopens the dialog with them.

## Settings

The interface is in English or French (*Langue / Language* menu). **The settings of the tools keep
the names used by the tools themselves**, in both languages, so they can be matched one to one.

*Advanced mode* shows:

| Tool | Settings |
|---|---|
| GraXpert | Smoothing, Correction (Subtraction / Division), Show background, Disable GPU acceleration |
| BlurXTerminator | Correct Only, Sharpen Stars, Adjust Star Halos, Automatic PSF, PSF Diameter, Sharpen Nonstellar |
| StarXTerminator | Generate Star Image, Unscreen Stars |
| Auto STF | Shadows clipping (default -2.80, in normalized MAD units), Target background (default 0.25) |
| NoiseXTerminator | Intensity/color separation, Frequency separation, then only the settings used by that mode (Denoise; Denoise HF / LF; Denoise HF / LF intensity and color), Frequency scale, Detail, Iterations |

Notes:

* GraXpert *Smoothing*: the GraXpert process documentation recommends 0.0 in most cases (it only
  blurs the background model). The default here is 0.2, the author's own setting.
* NoiseXTerminator *Intensity/color separation* only works on color images (RC Astro
  documentation). It is off by default because SII, Ha and OIII masters are monochrome.
* StarXTerminator *Unscreen Stars* is meant for stretched images; RC Astro recommends not using it on
  linear data.

## License

Copyright (c) 2026 Jacques Pouyaud. Released under the [MIT License](LICENSE).

## Credits

*Code written by Claude (Anthropic), under the direction of Jacques Pouyaud, who defined the need,
tested it on his own data and validated the results.*
