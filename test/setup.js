// Installs the browser globals Pluck reads at construction time. Preloaded for
// every test file via bunfig.toml, so it runs before any src/ module is imported.
import { installBrowserGlobals } from './mocks/MockAudioContext.js'

installBrowserGlobals()
