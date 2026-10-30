#engine v8

#feature-id    NarrowbandStarless : JPS > NarrowbandStarless
#feature-info  Runs the same linear pipeline on each narrowband master (SII, Ha, \
   OIII): GraXpert background extraction, BlurXTerminator, StarXTerminator and \
   NoiseXTerminator, one channel after the other, then an optional auto STF on the \
   results. The views are picked manually, \
   the main settings of each tool are reachable in advanced mode, and the source \
   images are left untouched (work on copies). Interface in English or French.

/*
 * NarrowbandStarless.js  v1.0.2
 * Copyright (c) 2026 Jacques Pouyaud.
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Free software under the GNU General Public License, version 3 or (at your
 * option) any later version, WITHOUT ANY WARRANTY; see LICENSE.
 * Code written by Claude (Anthropic),
 * under the direction of Jacques Pouyaud.
 * https://github.com/jps-34/NarrowbandStarless
 *
 * v1.0.2: menu entry moved to Script > JPS (was Script > Utilities).
 * v1.0.0: first release.
 * ----------------------------------------------------------------------------
 * For each enabled channel (SII, Ha, OIII), on a copy of the selected view:
 *   1. GraXpert, AI background extraction (Replace image forced on, so the
 *      next steps see the corrected image);
 *   2. BlurXTerminator;
 *   3. StarXTerminator (starless; optional star image);
 *   4. NoiseXTerminator;
 *   5. optional auto STF (linked) on the result and the background models.
 * Each tool is instantiated and executed on its own (no ProcessContainer), with
 * per-step timing and abort between steps. Extra windows created by a step are
 * renamed: Background_<channel> (GraXpert) and Stars_<channel> (StarXTerminator).
 *
 * Advanced mode exposes the main settings of each tool, labelled exactly like
 * the tools themselves, in both languages.
 *
 * Requirements: PixInsight 1.9.4 or later (V8), the GraXpert process
 * (DeepSkyForge) with the GraXpert application, and the RC Astro
 * BlurXTerminator, StarXTerminator and NoiseXTerminator processes.
 */

var TITLE = "NarrowbandStarless";
var VERSION = "1.0.2";
var LANG_KEY = "NarrowbandStarless/language";
var SETTINGS_KEY = "NarrowbandStarless/settings";
var LANG = "en";

// ============================================================================
// Language
// ============================================================================

function detectLanguage()
{
   try
   {
      var saved = Settings.read( LANG_KEY, DataType.String );
      if ( saved == "fr" || saved == "en" )
         return saved;
   }
   catch ( e ) {}
   var names = [ "LANGUAGE", "LC_ALL", "LC_MESSAGES", "LANG" ];
   for ( var i = 0; i < names.length; ++i )
   {
      try
      {
         var v = "";
         if ( typeof System !== "undefined" && System.getEnvironmentVariable )
            v = System.getEnvironmentVariable( names[i] );
         else if ( typeof getEnvironmentVariable === "function" )
            v = getEnvironmentVariable( names[i] );
         if ( v && v.length > 0 && v != "C" && v != "POSIX" )
            return v.toLowerCase().indexOf( "fr" ) == 0 ? "fr" : "en";
      }
      catch ( e ) {}
   }
   try
   {
      var loc = Intl.DateTimeFormat().resolvedOptions().locale;
      if ( loc && loc.toLowerCase().indexOf( "fr" ) == 0 )
         return "fr";
   }
   catch ( e ) {}
   return "en";
}

function saveLanguage( lang )
{
   try { Settings.write( LANG_KEY, DataType.String, lang ); } catch ( e ) {}
}

function L( fr, en )
{
   return LANG == "fr" ? fr : en;
}

// ============================================================================
// Channels and settings
// ============================================================================

// Channel slots. 'pattern' is used to preselect a matching view.
var CHANNELS = [
   { key: "SII",  label: "SII",  idKey: "sId", useKey: "useS", outKey: "outS", pattern: /SII|S2/i },
   { key: "Ha",   label: "Ha",   idKey: "hId", useKey: "useH", outKey: "outH", pattern: /(^|[^a-z])H(a|alpha)([^a-z]|$)/i },
   { key: "OIII", label: "OIII", idKey: "oId", useKey: "useO", outKey: "outO", pattern: /OIII|O3/i }
];

var DEFAULTS = {
   // channels
   sId: "", hId: "", oId: "",
   useS: true, useH: true, useO: true,
   outS: "Starless_SII", outH: "Starless_Ha", outO: "Starless_OIII",
   // general
   workOnCopy: true,
   advanced: false,
   // GraXpert
   gxEnabled: true,
   gxSmoothing: 0.2,
   gxCorrection: "Subtraction",
   gxShowBackground: false,
   gxDisableGPU: false,
   // BlurXTerminator
   bxtEnabled: true,
   bxtCorrectOnly: false,
   bxtSharpenStars: 0.30,
   bxtAdjustStarHalos: -0.30,
   bxtAutoPSF: true,
   bxtPSFDiameter: 0.0,
   bxtSharpenNonstellar: 0.50,
   // StarXTerminator
   sxtEnabled: true,
   sxtGenerateStars: false,
   sxtUnscreen: false,
   // NoiseXTerminator (intensity/color separation needs a color image: off for mono masters)
   nxtEnabled: true,
   nxtColorSep: false,
   nxtFreqSep: true,
   nxtDenoise: 0.85,
   nxtDetail: 0.15,
   nxtIterations: 5,
   nxtDenoiseIntensity: 0.90,
   nxtDenoiseColor: 0.90,
   nxtDenoiseHF: 0.80,
   nxtDenoiseLF: 0.90,
   nxtDenoiseIntensityHF: 0.80,
   nxtDenoiseIntensityLF: 0.90,
   nxtDenoiseColorHF: 0.90,
   nxtDenoiseColorLF: 0.90,
   nxtFrequencyScale: 5.0,
   // Auto STF on the results (display only, pixels unchanged)
   autoSTF: true,
   stfShadowsClipping: -2.80,
   stfTargetBackground: 0.25
};

var TP = {};

function resetTP( keepViews )
{
   var keep = {};
   if ( keepViews )
      for ( var i = 0; i < CHANNELS.length; ++i )
         keep[CHANNELS[i].idKey] = TP[CHANNELS[i].idKey];
   for ( var key in DEFAULTS )
      TP[key] = DEFAULTS[key];
   for ( var k in keep )
      TP[k] = keep[k];
}

function saveSettings()
{
   try { Settings.write( SETTINGS_KEY, DataType.String, JSON.stringify( TP ) ); } catch ( e ) {}
}

function loadSettings()
{
   try
   {
      var s = Settings.read( SETTINGS_KEY, DataType.String );
      if ( s != null && s.length > 0 )
      {
         var o = JSON.parse( s );
         for ( var key in DEFAULTS )
            if ( o[key] !== undefined && typeof o[key] == typeof DEFAULTS[key] )
               TP[key] = o[key];
      }
   }
   catch ( e ) {}
}

// Process icon support: every setting is stored as a script parameter.
function saveParameters()
{
   Parameters.clear();
   for ( var key in DEFAULTS )
   {
      var t = typeof DEFAULTS[key];
      if ( t == "string" || t == "boolean" || t == "number" )
         Parameters.set( key, TP[key] );
   }
}

function loadParameters()
{
   for ( var key in DEFAULTS )
   {
      if ( !Parameters.has( key ) )
         continue;
      var t = typeof DEFAULTS[key];
      if ( t == "string" )
         TP[key] = Parameters.getString( key );
      else if ( t == "boolean" )
         TP[key] = Parameters.getBoolean( key );
      else
         TP[key] = Parameters.getReal( key );
   }
}

// ============================================================================
// Helpers
// ============================================================================

function log( s )
{
   console.writeln( s );
   console.flush();
}

function errText( e )
{
   return ( e && e.message ) ? e.message : String( e );
}

function findView( id )
{
   if ( id == null || id.length == 0 )
      return null;
   var v = View.viewById( id );
   return ( v == null || v.isNull ) ? null : v;
}

function uniqueId( base )
{
   if ( findView( base ) == null )
      return base;
   var n = 1;
   while ( findView( base + "_" + n ) != null )
      ++n;
   return base + "_" + n;
}

function windowIdSet()
{
   var set = {};
   var ws = ImageWindow.windows;
   for ( var i = 0; i < ws.length; ++i )
      set[ws[i].mainView.id] = true;
   return set;
}

// First open main view whose id matches the channel pattern (previous results skipped).
function guessView( channel )
{
   var ws = ImageWindow.windows;
   for ( var i = 0; i < ws.length; ++i )
   {
      var id = ws[i].mainView.id;
      if ( /^(Starless|Stars|Background)_/i.test( id ) )
         continue;
      if ( channel.pattern.test( id ) )
         return ws[i].mainView;
   }
   return null;
}

// Copy a view into a new window, keeping keywords and astrometric solution.
function duplicateView( view, newId )
{
   var src = view.window;
   var img = view.image;
   var w = new ImageWindow( img.width, img.height, img.numberOfChannels,
                            32, true, img.isColor, uniqueId( newId ) );
   w.mainView.beginProcess( UndoFlag.NoSwapFile );
   w.mainView.image.assign( img );
   w.mainView.endProcess();
   w.keywords = src.keywords;
   if ( src.hasAstrometricSolution )
      try
      {
         w.copyAstrometricSolution( src );
      }
      catch ( e )
      {
         console.warningln( L( "Solution astrométrique non copiée : ", "Astrometric solution not copied: " ) + errText( e ) );
      }
   return w;
}

function errorBox( text )
{
   ( new MessageBox( "<p>" + text + "</p>", TITLE, StdIcon.Error, StdButton.Ok ) ).execute();
}

// ============================================================================
// Auto STF
// ============================================================================

// Midtones transfer function.
function mtf( m, x )
{
   if ( x <= 0 ) return 0;
   if ( x >= 1 ) return 1;
   if ( x == m ) return 0.5;
   return ( m - 1 ) * x / ( ( 2 * m - 1 ) * x - m );
}

// Median and normalized MAD of one channel.
function channelStats( view, c )
{
   var img = view.image;
   try
   {
      img.selectedChannel = c;
      var med = img.median();
      var mad = img.MAD( med );
      img.resetSelections();
      return { median: med, mad: 1.4826 * mad };
   }
   catch ( e )
   {
      try { img.resetSelections(); } catch ( e2 ) {}
      var m = view.computeOrFetchProperty( "Median" );
      var d = view.computeOrFetchProperty( "MAD" );
      return { median: m.at( c ), mad: 1.4826 * d.at( c ) };
   }
}

// Linked automatic screen stretch, as the STF auto stretch: shadows clipped at
// median + shadowsClipping * normalized MAD, midtones set so that the median
// lands on the target background. Display only: the pixels are not changed.
function applyAutoSTF( view, shadowsClipping, targetBackground )
{
   var n = view.image.isColor ? 3 : 1;
   var c0 = 0, median = 0;
   for ( var c = 0; c < n; ++c )
   {
      var s = channelStats( view, c );
      if ( 1 + s.mad != 1 )
         c0 += s.median + shadowsClipping * s.mad;
      median += s.median;
   }
   c0 = Math.min( Math.max( c0 / n, 0 ), 1 );
   var m = mtf( targetBackground, median / n - c0 );
   var stf = new ScreenTransferFunction;
   stf.STF = [ [ c0, 1, m, 0, 1 ],
               [ c0, 1, m, 0, 1 ],
               [ c0, 1, m, 0, 1 ],
               [ 0, 1, 0.5, 0, 1 ] ];
   stf.executeOn( view );
   return { c0: c0, m: m };
}

// ============================================================================
// Tool instances
// ============================================================================

function makeGraXpert( p )
{
   var P = new GraXpert;
   P.backgroundExtractionSampleFree = false;
   P.backgroundExtraction = true;
   P.smoothing = p.gxSmoothing;
   P.backgroundExtractionAIModel = "";
   P.denoising = false;
   P.deconvolution = false;
   P.correction = p.gxCorrection;
   P.createBackground = p.gxShowBackground;
   P.disableGPU = p.gxDisableGPU;
   P.replaceImage = true;           // required: the next steps must see the corrected image
   P.showLogs = false;
   P.appPath = "";
   P.batchSize = 4;
   return P;
}

function makeBlurX( p )
{
   var P = new BlurXTerminator;
   P.ml_version = 0;
   P.correct_only = p.bxtCorrectOnly;
   P.sharpen_stars = p.bxtSharpenStars;
   P.adjust_star_halos = p.bxtAdjustStarHalos;
   P.nonstellar_diameter = p.bxtPSFDiameter;
   P.auto_nonstellar_psf = p.bxtAutoPSF;
   P.sharpen_nonstellar = p.bxtSharpenNonstellar;
   P.lunar_planetary = false;
   P.overlap = 0.50;
   return P;
}

function makeStarX( p )
{
   var P = new StarXTerminator;
   P.ml_version = 0;
   P.output_stars = p.sxtGenerateStars;
   P.unscreen = p.sxtUnscreen;
   P.remove_stars = true;
   P.remove_spikes = true;
   P.remove_aureoles = false;
   P.remove_reflections = false;
   P.overlap = 0.50;
   return P;
}

function makeNoiseX( p )
{
   var P = new NoiseXTerminator;
   P.ml_version = 0;
   P.enable_color_separation = p.nxtColorSep;
   P.enable_frequency_separation = p.nxtFreqSep;
   P.denoise = p.nxtDenoise;
   P.detail = p.nxtDetail;
   P.iterations = Math.round( p.nxtIterations );
   P.denoise_intensity = p.nxtDenoiseIntensity;
   P.denoise_color = p.nxtDenoiseColor;
   P.denoise_high_freq = p.nxtDenoiseHF;
   P.denoise_low_freq = p.nxtDenoiseLF;
   P.denoise_intensity_high_freq = p.nxtDenoiseIntensityHF;
   P.denoise_intensity_low_freq = p.nxtDenoiseIntensityLF;
   P.denoise_color_high_freq = p.nxtDenoiseColorHF;
   P.denoise_color_low_freq = p.nxtDenoiseColorLF;
   P.frequency_scale = p.nxtFrequencyScale;
   P.overlap = 0.50;
   return P;
}

// Steps in execution order. 'extraPrefix' names any extra window a step creates.
// StarXTerminator star images get no auto STF: RC Astro advises against it, the
// tool translates the STF of the source image to the star image.
function buildSteps( p )
{
   var steps = [];
   if ( p.gxEnabled )  steps.push( { name: "GraXpert",         make: makeGraXpert, extraPrefix: "Background_" } );
   if ( p.bxtEnabled ) steps.push( { name: "BlurXTerminator",  make: makeBlurX,    extraPrefix: "" } );
   if ( p.sxtEnabled ) steps.push( { name: "StarXTerminator",  make: makeStarX,    extraPrefix: "Stars_" } );
   if ( p.nxtEnabled ) steps.push( { name: "NoiseXTerminator", make: makeNoiseX,   extraPrefix: "" } );
   return steps;
}

// ============================================================================
// Jobs
// ============================================================================

// Checks the channel selection. Returns the job list, or throws a user error.
function buildJobs( p )
{
   var jobs = [];
   var usedViews = {};
   var usedNames = {};
   for ( var i = 0; i < CHANNELS.length; ++i )
   {
      var c = CHANNELS[i];
      if ( !p[c.useKey] )
         continue;
      var view = findView( p[c.idKey] );
      if ( view == null )
         throw new Error( L( "Aucune image choisie pour le canal ", "No image selected for channel " ) + c.label + "." );
      if ( usedViews[view.fullId] )
         throw new Error( L( "L'image " + view.id + " est choisie pour deux canaux.",
                             "Image " + view.id + " is selected for two channels." ) );
      usedViews[view.fullId] = true;

      var name = String( p[c.outKey] ).trim();
      if ( !/^[A-Za-z_][A-Za-z0-9_]*$/.test( name ) )
         throw new Error( L( "Nom de résultat invalide pour " + c.label + " : « " + name + " ». " +
                             "Lettres, chiffres et _ uniquement, sans chiffre au début.",
                             "Invalid result name for " + c.label + ": \"" + name + "\". " +
                             "Letters, digits and _ only, not starting with a digit." ) );
      if ( usedNames[name] )
         throw new Error( L( "Le nom « " + name + " » est utilisé pour deux canaux.",
                             "The name \"" + name + "\" is used for two channels." ) );
      usedNames[name] = true;
      if ( findView( name ) == view )
         throw new Error( L( "Le nom de résultat de " + c.label + " est celui de l'image source.",
                             "The result name of " + c.label + " is the name of the source image." ) );

      jobs.push( { key: c.key, label: c.label, view: view, outputId: name } );
   }
   if ( jobs.length == 0 )
      throw new Error( L( "Aucun canal sélectionné.", "No channel selected." ) );
   if ( buildSteps( p ).length == 0 )
      throw new Error( L( "Aucun outil n'est activé.", "No tool is enabled." ) );
   return jobs;
}

function processJob( job, steps, p )
{
   var t0 = Date.now();
   var target = job.view;
   var backgrounds = [];
   if ( p.workOnCopy )
   {
      var w = duplicateView( job.view, job.outputId + "_wip" );
      w.show();
      target = w.mainView;
   }

   for ( var s = 0; s < steps.length; ++s )
   {
      var step = steps[s];
      log( "<end><cbr><b>--- " + job.label + " : " + step.name + "</b>" );
      var before = windowIdSet();
      var t = Date.now();

      if ( !step.make( p ).executeOn( target ) )
         throw new Error( step.name + L( " a échoué sur ", " failed on " ) + job.label );
      log( format( L( "%s terminé en %.1f s", "%s done in %.1f s" ), step.name, ( Date.now() - t ) / 1000 ) );

      // Rename any extra window created by this step (background model, star image).
      if ( step.extraPrefix.length > 0 )
      {
         var ws = ImageWindow.windows;
         for ( var i = 0; i < ws.length; ++i )
         {
            var id = ws[i].mainView.id;
            if ( !before[id] && id != target.id )
            {
               ws[i].mainView.id = uniqueId( step.extraPrefix + job.key );
               log( L( "Fenêtre annexe : ", "Extra window: " ) + ws[i].mainView.id );
               if ( step.extraPrefix == "Background_" )
                  backgrounds.push( ws[i].mainView );
            }
         }
      }

      CoreApplication.processEvents();
      if ( console.abortRequested )
         throw new Error( L( "Interrompu par l'utilisateur", "Aborted by user" ) );
   }

   target.id = uniqueId( job.outputId );

   // Auto STF at the end of the pipeline: result and background model.
   if ( p.autoSTF )
   {
      var list = [ target ].concat( backgrounds );
      for ( var b = 0; b < list.length; ++b )
      {
         var r = applyAutoSTF( list[b], p.stfShadowsClipping, p.stfTargetBackground );
         log( format( L( "Auto STF sur %s : ombres %.6f, tons moyens %.6f",
                         "Auto STF on %s: shadows %.6f, midtones %.6f" ), list[b].id, r.c0, r.m ) );
      }
   }

   log( format( "<b>%s -> %s (%.1f s)</b>", job.view.id, target.id, ( Date.now() - t0 ) / 1000 ) );
}

function runPipeline( p )
{
   var jobs = buildJobs( p );
   var steps = buildSteps( p );
   console.show();
   try { console.abortEnabled = true; } catch ( e ) {}
   var t0 = Date.now();
   log( "<end><cbr><b>" + TITLE + " " + VERSION + "</b> : " +
        steps.map( function( s ) { return s.name; } ).join( " > " ) +
        ( p.workOnCopy ? L( " (sur copies)", " (on copies)" ) : L( " (sur les originaux)", " (on the originals)" ) ) );
   try
   {
      for ( var i = 0; i < jobs.length; ++i )
      {
         log( "<end><cbr><b>=== " + jobs[i].label + " : " + jobs[i].view.id +
              " (" + ( i + 1 ) + "/" + jobs.length + ") ===</b>" );
         processJob( jobs[i], steps, p );
      }
      log( format( L( "<end><cbr><b>Terminé en %.1f s</b>", "<end><cbr><b>Done in %.1f s</b>" ), ( Date.now() - t0 ) / 1000 ) );
   }
   finally
   {
      try { console.abortEnabled = false; } catch ( e ) {}
   }
}

// ============================================================================
// Tooltips
// ============================================================================

function tips()
{
   return {
      channel: L( "<p>Traiter ce canal.</p>", "<p>Process this channel.</p>" ),
      view: L( "<p>Image source du canal (master linéaire, avec étoiles).</p>",
               "<p>Source image of the channel (linear master, with stars).</p>" ),
      out: L( "<p>Identifiant de l'image résultat. Un suffixe _1, _2... est ajouté si le nom existe déjà.</p>",
              "<p>Identifier of the result image. A _1, _2... suffix is added if the name already exists.</p>" ),
      workOnCopy: L( "<p>Les outils travaillent sur une copie de chaque image source, qui reste intacte. " +
                     "Décoché : les originaux sont modifiés puis renommés.</p>",
                     "<p>The tools work on a copy of each source image, which stays untouched. " +
                     "Unchecked: the originals are modified, then renamed.</p>" ),
      advanced: L( "<p>Affiche les réglages principaux de chaque outil, nommés comme dans les outils.</p>",
                   "<p>Shows the main settings of each tool, named as in the tools.</p>" ),
      gxSmoothing: L( "<p>Flou gaussien ajouté au modèle de fond. La documentation du process GraXpert " +
                      "recommande 0.0 dans la plupart des cas.</p>",
                      "<p>Gaussian blur added to the background model. The GraXpert process documentation " +
                      "recommends 0.0 in most cases.</p>" ),
      gxCorrection: L( "<p>Subtraction dans la plupart des cas, Division seulement pour des gradients très forts " +
                       "(vignetage).</p>",
                       "<p>Subtraction in most cases, Division only for very strong gradients (vignetting).</p>" ),
      gxShowBackground: L( "<p>Affiche le modèle de fond calculé (fenêtre Background_&lt;canal&gt;). Utile pour " +
                           "vérifier que la nébuleuse n'est pas prise pour du fond.</p>",
                           "<p>Shows the computed background model (Background_&lt;channel&gt; window). Useful to " +
                           "check that the nebula is not taken for background.</p>" ),
      gxDisableGPU: L( "<p>Désactive l'accélération matérielle de GraXpert (problèmes de pilote).</p>",
                       "<p>Turns GraXpert hardware acceleration off (driver issues).</p>" ),
      bxtPSFDiameter: L( "<p>En pixels. Utilisé seulement si Automatic PSF est décoché.</p>",
                         "<p>In pixels. Used only when Automatic PSF is unchecked.</p>" ),
      sxtGenerateStars: L( "<p>Crée aussi l'image des étoiles (fenêtre Stars_&lt;canal&gt;).</p>",
                           "<p>Also creates the star image (Stars_&lt;channel&gt; window).</p>" ),
      sxtUnscreen: L( "<p>Réservé aux images étirées : RC Astro recommande de ne pas l'utiliser sur une image linéaire.</p>",
                      "<p>For stretched images only: RC Astro recommends not using it on a linear image.</p>" ),
      nxtColorSep: L( "<p>Ne fonctionne que sur une image couleur (documentation RC Astro). À laisser décoché " +
                      "pour des masters SII, Ha, OIII monochromes.</p>",
                      "<p>Works on color images only (RC Astro documentation). Leave unchecked for " +
                      "monochrome SII, Ha, OIII masters.</p>" ),
      nxtFrequencyScale: L( "<p>En pixels : échelle qui sépare hautes et basses fréquences.</p>",
                            "<p>In pixels: scale separating high and low frequencies.</p>" ),
      autoSTF: L( "<p>Applique une STF automatique (liée) à chaque résultat et aux modèles de fond, en fin de " +
                  "pipeline. Affichage seulement : les pixels ne sont pas modifiés. Les images d'étoiles de " +
                  "StarXTerminator ne sont pas concernées (RC Astro le déconseille).</p>",
                  "<p>Applies a linked automatic STF to each result and to the background models, at the end of " +
                  "the pipeline. Display only: pixels are not changed. StarXTerminator star images are left " +
                  "alone (RC Astro advises against it).</p>" ),
      stfShadowsClipping: L( "<p>Écrêtage des ombres, en MAD normalisées sous la médiane. Plus négatif = fond plus " +
                             "clair.</p>",
                             "<p>Shadows clipping, in normalized MAD units below the median. More negative = " +
                             "brighter background.</p>" ),
      stfTargetBackground: L( "<p>Niveau visé pour la médiane du fond à l'écran (0 à 1).</p>",
                              "<p>Target screen level for the background median (0 to 1).</p>" ),
      lang: L( "<p>Langue de l'interface. Le dialogue se rouvre aussitôt dans la langue choisie, en gardant les " +
               "réglages. Le choix est mémorisé.</p>",
               "<p>Interface language. The dialog reopens right away in the chosen language, keeping the " +
               "settings. The choice is remembered.</p>" ),
      newInstance: L( "<p>Glisser sur le bureau pour créer une icône de process avec tous les réglages et le nom " +
                      "des images. Un double-clic sur l'icône rouvre ce dialogue avec ces réglages.</p>",
                      "<p>Drag to the workspace to create a process icon with all settings and image names. " +
                      "Double-clicking the icon reopens this dialog with these settings.</p>" ),
      reset: L( "<p>Remet tous les réglages à leurs valeurs par défaut (les images choisies sont conservées).</p>",
                "<p>Restores all settings to their default values (the selected images are kept).</p>" ),
      run: L( "<p>Lance le pipeline sur les canaux cochés, l'un après l'autre.</p>",
              "<p>Runs the pipeline on the checked channels, one after the other.</p>" )
   };
}

// ============================================================================
// Dialog
// ============================================================================

var NBDialog = class extends Dialog {
constructor()
{
   super();
   // Return must validate the edit boxes, not run a button of the dialog.
   this.autoDefaultButton = false;
   var self = this;
   var T = tips();
   this.windowTitle = TITLE + " " + VERSION;
   this.relaunch = false;
   this.runRequested = false;

   var lw = this.font.width( "Denoise HF intensity:" ) + 12;
   var chWidth = this.font.width( "OIII" ) + 40;
   var outWidth = this.font.width( "Starless_OIII_00" ) + 16;

   this.numerics = {};
   this.checks = {};

   function makeGroup( title )
   {
      var g = new GroupBox( self );
      g.title = title;
      g.sizer = new VerticalSizer;
      g.sizer.margin = 6;
      g.sizer.spacing = 4;
      return g;
   }

   function makeCheck( parent, key, text, tip )
   {
      var c = new CheckBox( parent );
      c.text = text;
      if ( tip ) c.toolTip = tip;
      c.onCheck = function( checked )
      {
         TP[key] = checked;
         self.refresh();
      };
      self.checks[key] = c;
      return c;
   }

   function makeNumeric( parent, key, label, min, max, prec, tip )
   {
      var nc = new NumericControl( parent );
      nc.label.text = label;
      nc.label.minWidth = lw;
      nc.setReal( true );
      nc.setRange( min, max );
      nc.setPrecision( prec );
      nc.slider.setRange( 0, 1000 );
      nc.slider.minWidth = 200;
      if ( tip ) nc.toolTip = tip;
      nc.onValueUpdated = function( v ) { TP[key] = v; };
      self.numerics[key] = nc;
      return nc;
   }

   function labelledRow( parent, text, control )
   {
      var l = new Label( parent );
      l.text = text;
      l.minWidth = lw;
      l.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;
      var s = new HorizontalSizer;
      s.spacing = 4;
      s.add( l );
      s.add( control );
      s.addStretch();
      return s;
   }

   // --- Help ------------------------------------------------------------------
   this.helpLabel = new Label( this );
   this.helpLabel.wordWrapping = true;
   this.helpLabel.useRichText = true;
   this.helpLabel.text = L(
      "<p><b>" + TITLE + "</b> : choisis l'image de chaque canal et les outils à appliquer. Les canaux sont " +
      "traités l'un après l'autre avec les mêmes réglages. Le mode avancé donne accès aux réglages de chaque " +
      "outil, nommés comme dans les outils eux-mêmes.</p>",
      "<p><b>" + TITLE + "</b>: pick the image of each channel and the tools to apply. Channels are processed " +
      "one after the other with the same settings. Advanced mode gives access to the settings of each tool, " +
      "named as in the tools themselves.</p>" );

   // --- Images ----------------------------------------------------------------
   this.imagesGroup = makeGroup( L( "Images", "Images" ) );
   this.rows = [];
   for ( var i = 0; i < CHANNELS.length; ++i )
   {
      var c = CHANNELS[i];
      var row = { channel: c };

      row.check = makeCheck( this.imagesGroup, c.useKey, c.label, T.channel );
      row.check.minWidth = chWidth;

      row.list = new ViewList( this.imagesGroup );
      row.list.getMainViews();
      row.list.minWidth = 280;
      row.list.toolTip = T.view;
      var v = findView( TP[c.idKey] );
      if ( v == null )
      {
         v = guessView( c );
         TP[c.idKey] = v != null ? v.id : "";
      }
      if ( v != null )
         row.list.currentView = v;
      row.list.onViewSelected = ( function( key ) {
         return function( view ) { TP[key] = ( view != null && !view.isNull ) ? view.id : ""; };
      } )( c.idKey );

      row.output = new Edit( this.imagesGroup );
      row.output.minWidth = outWidth;
      row.output.toolTip = T.out;
      row.output.onTextUpdated = ( function( key ) {
         return function( text ) { TP[key] = text; };
      } )( c.outKey );

      var rs = new HorizontalSizer;
      rs.spacing = 6;
      rs.add( row.check );
      rs.add( row.list, 100 );
      rs.add( row.output );
      this.imagesGroup.sizer.add( rs );
      this.rows.push( row );
   }

   // --- Pipeline --------------------------------------------------------------
   this.pipeGroup = makeGroup( L( "Pipeline", "Pipeline" ) );
   this.pipeGroup.sizer.add( makeCheck( this.pipeGroup, "gxEnabled",
      L( "GraXpert : retrait de gradient AI", "GraXpert: AI background extraction" ) ) );
   this.pipeGroup.sizer.add( makeCheck( this.pipeGroup, "bxtEnabled", "BlurXTerminator" ) );
   this.pipeGroup.sizer.add( makeCheck( this.pipeGroup, "sxtEnabled",
      L( "StarXTerminator : image sans étoiles", "StarXTerminator: starless image" ) ) );
   this.pipeGroup.sizer.add( makeCheck( this.pipeGroup, "nxtEnabled", "NoiseXTerminator" ) );
   this.pipeGroup.sizer.add( makeCheck( this.pipeGroup, "autoSTF",
      L( "Auto STF en fin de pipeline", "Auto STF at the end of the pipeline" ), T.autoSTF ) );
   this.pipeGroup.sizer.addSpacing( 6 );
   this.pipeGroup.sizer.add( makeCheck( this.pipeGroup, "workOnCopy",
      L( "Travailler sur une copie (les images sources restent intactes)",
         "Work on a copy (source images stay untouched)" ), T.workOnCopy ) );
   this.pipeGroup.sizer.add( makeCheck( this.pipeGroup, "advanced", L( "Mode avancé", "Advanced mode" ), T.advanced ) );

   // --- Advanced: GraXpert ----------------------------------------------------
   this.gxGroup = makeGroup( "GraXpert" );
   this.gxGroup.sizer.add( makeNumeric( this.gxGroup, "gxSmoothing", "Smoothing:", 0, 1, 2, T.gxSmoothing ) );
   this.gxCorrection = new ComboBox( this.gxGroup );
   this.gxCorrection.addItem( "Subtraction" );
   this.gxCorrection.addItem( "Division" );
   this.gxCorrection.toolTip = T.gxCorrection;
   this.gxCorrection.onItemSelected = function( index )
   {
      TP.gxCorrection = ( index == 1 ) ? "Division" : "Subtraction";
   };
   this.gxGroup.sizer.add( labelledRow( this.gxGroup, "Correction:", this.gxCorrection ) );
   this.gxGroup.sizer.add( makeCheck( this.gxGroup, "gxShowBackground", "Show background", T.gxShowBackground ) );
   this.gxGroup.sizer.add( makeCheck( this.gxGroup, "gxDisableGPU", "Disable GPU acceleration", T.gxDisableGPU ) );

   // --- Advanced: BlurXTerminator ---------------------------------------------
   this.bxtGroup = makeGroup( "BlurXTerminator" );
   this.bxtGroup.sizer.add( makeCheck( this.bxtGroup, "bxtCorrectOnly", "Correct Only" ) );
   this.bxtGroup.sizer.add( makeNumeric( this.bxtGroup, "bxtSharpenStars", "Sharpen Stars:", 0, 0.70, 2 ) );
   this.bxtGroup.sizer.add( makeNumeric( this.bxtGroup, "bxtAdjustStarHalos", "Adjust Star Halos:", -0.50, 0.50, 2 ) );
   this.bxtGroup.sizer.add( makeCheck( this.bxtGroup, "bxtAutoPSF", "Automatic PSF" ) );
   this.bxtGroup.sizer.add( makeNumeric( this.bxtGroup, "bxtPSFDiameter", "PSF Diameter:", 0, 8, 2, T.bxtPSFDiameter ) );
   this.bxtGroup.sizer.add( makeNumeric( this.bxtGroup, "bxtSharpenNonstellar", "Sharpen Nonstellar:", 0, 1, 2 ) );

   // --- Advanced: StarXTerminator ---------------------------------------------
   this.sxtGroup = makeGroup( "StarXTerminator" );
   this.sxtGroup.sizer.add( makeCheck( this.sxtGroup, "sxtGenerateStars", "Generate Star Image", T.sxtGenerateStars ) );
   this.sxtGroup.sizer.add( makeCheck( this.sxtGroup, "sxtUnscreen", "Unscreen Stars", T.sxtUnscreen ) );

   // --- Advanced: NoiseXTerminator --------------------------------------------
   this.nxtGroup = makeGroup( "NoiseXTerminator" );
   this.nxtGroup.sizer.add( makeCheck( this.nxtGroup, "nxtColorSep", "Intensity/color separation", T.nxtColorSep ) );
   this.nxtGroup.sizer.add( makeCheck( this.nxtGroup, "nxtFreqSep", "Frequency separation" ) );
   this.nxtGroup.sizer.add( makeNumeric( this.nxtGroup, "nxtDenoise", "Denoise:", 0, 1, 2 ) );
   this.nxtGroup.sizer.add( makeNumeric( this.nxtGroup, "nxtDenoiseIntensity", "Denoise intensity:", 0, 1, 2 ) );
   this.nxtGroup.sizer.add( makeNumeric( this.nxtGroup, "nxtDenoiseColor", "Denoise color:", 0, 1, 2 ) );
   this.nxtGroup.sizer.add( makeNumeric( this.nxtGroup, "nxtDenoiseHF", "Denoise HF:", 0, 1, 2 ) );
   this.nxtGroup.sizer.add( makeNumeric( this.nxtGroup, "nxtDenoiseLF", "Denoise LF:", 0, 1, 2 ) );
   this.nxtGroup.sizer.add( makeNumeric( this.nxtGroup, "nxtDenoiseIntensityHF", "Denoise HF intensity:", 0, 1, 2 ) );
   this.nxtGroup.sizer.add( makeNumeric( this.nxtGroup, "nxtDenoiseIntensityLF", "Denoise LF intensity:", 0, 1, 2 ) );
   this.nxtGroup.sizer.add( makeNumeric( this.nxtGroup, "nxtDenoiseColorHF", "Denoise HF color:", 0, 1, 2 ) );
   this.nxtGroup.sizer.add( makeNumeric( this.nxtGroup, "nxtDenoiseColorLF", "Denoise LF color:", 0, 1, 2 ) );
   this.nxtGroup.sizer.add( makeNumeric( this.nxtGroup, "nxtFrequencyScale", "Frequency scale:", 1, 10, 1, T.nxtFrequencyScale ) );
   this.nxtGroup.sizer.add( makeNumeric( this.nxtGroup, "nxtDetail", "Detail:", 0, 1, 2 ) );
   this.nxtIterations = new SpinBox( this.nxtGroup );
   this.nxtIterations.minValue = 1;
   this.nxtIterations.maxValue = 5;
   this.nxtIterations.onValueUpdated = function( v ) { TP.nxtIterations = v; };
   this.nxtGroup.sizer.add( labelledRow( this.nxtGroup, "Iterations:", this.nxtIterations ) );

   // --- Advanced: Auto STF ----------------------------------------------------
   this.stfGroup = makeGroup( "Auto STF" );
   this.stfGroup.sizer.add( makeNumeric( this.stfGroup, "stfShadowsClipping", "Shadows clipping:", -10, 0, 2, T.stfShadowsClipping ) );
   this.stfGroup.sizer.add( makeNumeric( this.stfGroup, "stfTargetBackground", "Target background:", 0, 1, 2, T.stfTargetBackground ) );

   // --- Language --------------------------------------------------------------
   this.langLabel = new Label( this );
   this.langLabel.text = "Langue / Language :";
   this.langLabel.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;
   this.langLabel.toolTip = T.lang;
   this.langCombo = new ComboBox( this );
   this.langCombo.addItem( "English" );
   this.langCombo.addItem( "Français" );
   this.langCombo.currentItem = LANG == "fr" ? 1 : 0;
   this.langCombo.toolTip = T.lang;
   this.langCombo.onItemSelected = function( idx )
   {
      var nl = idx == 1 ? "fr" : "en";
      if ( nl == LANG )
         return;
      LANG = nl;
      saveLanguage( nl );
      self.relaunch = true;
      self.ok();
   };
   var langRow = new HorizontalSizer;
   langRow.spacing = 4;
   langRow.addStretch();
   langRow.add( this.langLabel );
   langRow.add( this.langCombo );

   // --- Buttons ---------------------------------------------------------------
   this.newInstanceButton = new ToolButton( this );
   this.newInstanceButton.icon = this.scaledResource( ":/process-interface/new-instance.png" );
   this.newInstanceButton.setScaledFixedSize( 20, 20 );
   this.newInstanceButton.toolTip = T.newInstance;
   this.newInstanceButton.onMousePress = function()
   {
      this.hasFocus = true;
      saveParameters();
      this.pushed = false;
      this.dialog.newInstance();
   };

   this.resetButton = new PushButton( this );
   this.resetButton.text = L( "Réinitialiser", "Reset" );
   this.resetButton.icon = this.scaledResource( ":/process-interface/reset.png" );
   this.resetButton.toolTip = T.reset;
   this.resetButton.onClick = function()
   {
      resetTP( true );
      self.updateControls();
   };

   this.runButton = new PushButton( this );
   this.runButton.text = L( "Exécuter", "Run" );
   this.runButton.icon = this.scaledResource( ":/icons/ok.png" );
   this.runButton.toolTip = T.run;
   this.runButton.onClick = function()
   {
      try
      {
         buildJobs( TP );
      }
      catch ( e )
      {
         errorBox( errText( e ) );
         return;
      }
      saveSettings();
      self.runRequested = true;
      self.ok();
   };

   this.closeButton = new PushButton( this );
   this.closeButton.text = L( "Fermer", "Close" );
   this.closeButton.icon = this.scaledResource( ":/icons/cancel.png" );
   this.closeButton.onClick = function()
   {
      saveSettings();
      self.cancel();
   };

   var bRow = new HorizontalSizer;
   bRow.spacing = 6;
   bRow.add( this.newInstanceButton );
   bRow.addStretch();
   bRow.add( this.resetButton );
   bRow.add( this.runButton );
   bRow.add( this.closeButton );

   this.sizer = new VerticalSizer;
   this.sizer.margin = 8;
   this.sizer.spacing = 8;
   this.sizer.add( this.helpLabel );
   this.sizer.add( this.imagesGroup );
   this.sizer.add( this.pipeGroup );
   this.sizer.add( this.gxGroup );
   this.sizer.add( this.bxtGroup );
   this.sizer.add( this.sxtGroup );
   this.sizer.add( this.nxtGroup );
   this.sizer.add( this.stfGroup );
   this.sizer.add( langRow );
   this.sizer.add( bRow );

   this.updateControls();
}

// Push the settings into the controls.
updateControls()
{
   for ( var k in this.numerics )
      this.numerics[k].setValue( TP[k] );
   for ( var k in this.checks )
      this.checks[k].checked = TP[k];
   for ( var i = 0; i < this.rows.length; ++i )
      this.rows[i].output.text = TP[this.rows[i].channel.outKey];
   this.gxCorrection.currentItem = ( TP.gxCorrection == "Division" ) ? 1 : 0;
   this.nxtIterations.value = Math.round( TP.nxtIterations );
   this.refresh();
}

// Enable and show the controls according to the settings.
refresh()
{
   var n = this.numerics;

   for ( var i = 0; i < this.rows.length; ++i )
   {
      var r = this.rows[i];
      var on = TP[r.channel.useKey];
      r.list.enabled = on;
      r.output.enabled = on;
   }

   var adv = TP.advanced;
   this.gxGroup.visible = adv;
   this.bxtGroup.visible = adv;
   this.sxtGroup.visible = adv;
   this.nxtGroup.visible = adv;
   this.stfGroup.visible = adv;

   this.stfGroup.enabled = TP.autoSTF;
   this.gxGroup.enabled = TP.gxEnabled;
   this.bxtGroup.enabled = TP.bxtEnabled;
   this.sxtGroup.enabled = TP.sxtEnabled;
   this.nxtGroup.enabled = TP.nxtEnabled;

   // BlurXTerminator: Correct Only disables sharpening; Automatic PSF disables PSF Diameter.
   var co = TP.bxtCorrectOnly;
   n.bxtSharpenStars.enabled = !co;
   n.bxtAdjustStarHalos.enabled = !co;
   n.bxtSharpenNonstellar.enabled = !co;
   this.checks.bxtAutoPSF.enabled = !co;
   n.bxtPSFDiameter.enabled = !co && !TP.bxtAutoPSF;

   // NoiseXTerminator: show only the settings used by the selected separation mode.
   var cs = TP.nxtColorSep, fs = TP.nxtFreqSep;
   n.nxtDenoise.visible            = !cs && !fs;
   n.nxtDenoiseIntensity.visible   =  cs && !fs;
   n.nxtDenoiseColor.visible       =  cs && !fs;
   n.nxtDenoiseHF.visible          = !cs &&  fs;
   n.nxtDenoiseLF.visible          = !cs &&  fs;
   n.nxtDenoiseIntensityHF.visible =  cs &&  fs;
   n.nxtDenoiseIntensityLF.visible =  cs &&  fs;
   n.nxtDenoiseColorHF.visible     =  cs &&  fs;
   n.nxtDenoiseColorLF.visible     =  cs &&  fs;
   n.nxtFrequencyScale.visible     =  fs;

   this.adjustToContents();
}
};

// ============================================================================
// Entry point
// ============================================================================

function main()
{
   LANG = detectLanguage();
   resetTP( false );
   if ( Parameters.isGlobalTarget || Parameters.isViewTarget )
      loadParameters();
   else
      loadSettings();

   for ( ;; )
   {
      var dialog = new NBDialog;
      dialog.execute();
      if ( dialog.relaunch )
         continue;
      if ( dialog.runRequested )
         try
         {
            runPipeline( TP );
         }
         catch ( e )
         {
            console.criticalln( TITLE + " : " + errText( e ) );
            console.flush();
         }
      break;
   }
}

main();
