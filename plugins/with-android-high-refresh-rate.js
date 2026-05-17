const { withMainActivity } = require("@expo/config-plugins");

const IMPORT_DISPLAY = "import android.view.Display";
const ON_CREATE_HOOK = "    preferHighestRefreshRate()\n";
const ON_RESUME_METHOD = `
  override fun onResume() {
    super.onResume()
    preferHighestRefreshRate()
  }
`;
const HELPERS = `
  private fun preferHighestRefreshRate() {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
          return
      }

      @Suppress("DEPRECATION")
      val display = windowManager.defaultDisplay
      val mode = chooseHighestRefreshRateMode(display) ?: return

      window.attributes = window.attributes.apply {
          preferredDisplayModeId = mode.modeId
          preferredRefreshRate = mode.refreshRate
      }
  }

  private fun chooseHighestRefreshRateMode(display: Display): Display.Mode? {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
          return null
      }

      val currentMode = display.mode
      val matchingResolutionModes = display.supportedModes.filter {
          it.physicalWidth == currentMode.physicalWidth &&
              it.physicalHeight == currentMode.physicalHeight
      }
      val candidateModes = matchingResolutionModes.ifEmpty { display.supportedModes.toList() }

      return candidateModes.maxWithOrNull(
          compareBy<Display.Mode> { it.refreshRate }
              .thenBy { it.physicalWidth * it.physicalHeight }
      )
  }
`;

function addImport(contents) {
  if (contents.includes(IMPORT_DISPLAY)) {
    return contents;
  }

  return contents.replace("import android.os.Bundle\n", `import android.os.Bundle\n${IMPORT_DISPLAY}\n`);
}

function addOnCreateHook(contents) {
  if (contents.includes("preferHighestRefreshRate()")) {
    return contents;
  }

  return contents.replace("    super.onCreate(null)\n", `    super.onCreate(null)\n${ON_CREATE_HOOK}`);
}

function addOnResume(contents) {
  if (contents.includes("override fun onResume()")) {
    return contents;
  }

  return contents.replace(/\n  \/\*\*\n   \* Returns the name of the main component/, `${ON_RESUME_METHOD}\n  /**\n   * Returns the name of the main component`);
}

function addHelpers(contents) {
  if (contents.includes("private fun preferHighestRefreshRate()")) {
    return contents;
  }

  return contents.replace(/\n}\s*$/, `${HELPERS}}\n`);
}

module.exports = function withAndroidHighRefreshRate(config) {
  return withMainActivity(config, (config) => {
    if (config.modResults.language !== "kt") {
      return config;
    }

    let contents = config.modResults.contents;
    contents = addImport(contents);
    contents = addOnCreateHook(contents);
    contents = addOnResume(contents);
    contents = addHelpers(contents);
    config.modResults.contents = contents;

    return config;
  });
};
