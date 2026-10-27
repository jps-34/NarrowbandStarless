# Changelog

## 1.0.1 (2026-10-27)
* Licence changed from MIT to the GNU General Public License, version 3 or later
  (GPL-3.0-or-later). Versions up to 1.0.0 remain available under the MIT License. No change to
  the script's behaviour.
* README: credit request for reuse of the method or the code.

## 1.0.0 (2026-10-18)
* First release.
* Per-channel view selection (SII, Ha, OIII), preselected from the view names; each channel can be
  skipped and its result renamed.
* Pipeline run tool by tool, without ProcessContainer: GraXpert (AI background extraction, Replace
  image forced on), BlurXTerminator, StarXTerminator, NoiseXTerminator. Timing per step, abort between
  steps.
* Work on copies by default: the source images are never modified; copies keep FITS keywords and the
  astrometric solution.
* Advanced mode with the main settings of each tool, named exactly as in the tools. NoiseXTerminator
  shows only the settings used by the selected separation mode; intensity/color separation is off by
  default (monochrome masters).
* Auto STF at the end of the pipeline (on by default): linked automatic screen stretch on each result
  and background model, display only. Shadows clipping and target background in advanced mode. Star
  images are left alone.
* Extra windows renamed `Background_<channel>` and `Stars_<channel>`.
* English or French interface, settings remembered between sessions, Reset button, process icon
  support (New Instance).
* PixInsight 1.9.4 and later (V8).
