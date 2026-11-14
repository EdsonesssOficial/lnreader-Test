package expo.modules.nativebackgroundmusic

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.ReactApplicationContext
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NativeBackgroundMusicModule : Module() {
    private var pendingPick: Promise? = null

    private val reactContext: ReactApplicationContext?
        get() = appContext.reactContext as? ReactApplicationContext

    private val playerDelegate = lazy {
        BackgroundMusicPlayer(
            context = requireNotNull(appContext.reactContext).applicationContext,
            onTrackChanged = { index, uri ->
                sendEvent("onTrackChanged", mapOf("index" to index, "uri" to uri))
            },
            onEnded = { sendEvent("onEnded", mapOf<String, Any?>()) },
            onError = { message -> sendEvent("onError", mapOf("message" to message)) },
        )
    }
    private val player: BackgroundMusicPlayer by playerDelegate

    private val activityEventListener = object : BaseActivityEventListener() {
        override fun onActivityResult(
            activity: Activity,
            requestCode: Int,
            resultCode: Int,
            data: Intent?,
        ) {
            if (requestCode != PICK_AUDIO_REQUEST) return
            val promise = pendingPick ?: return
            pendingPick = null
            if (resultCode != Activity.RESULT_OK || data == null) {
                promise.reject("ECANCELLED", "Audio selection was cancelled", null)
                return
            }
            val uris = mutableListOf<Uri>()
            val clip = data.clipData
            if (clip != null) {
                for (i in 0 until clip.itemCount) {
                    clip.getItemAt(i).uri?.let { uris.add(it) }
                }
            }
            data.data?.let { if (!uris.contains(it)) uris.add(it) }

            val resolver = reactContext?.contentResolver
            val tracks = uris.map { uri ->
                try {
                    resolver?.takePersistableUriPermission(
                        uri,
                        Intent.FLAG_GRANT_READ_URI_PERMISSION,
                    )
                } catch (_: SecurityException) {
                    // Some providers do not support persisted grants.
                }
                mapOf("uri" to uri.toString(), "name" to displayName(uri))
            }
            promise.resolve(tracks)
        }
    }

    private fun displayName(uri: Uri): String {
        try {
            reactContext?.contentResolver
                ?.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
                ?.use { cursor ->
                    if (cursor.moveToFirst()) {
                        val name = cursor.getString(0)
                        if (!name.isNullOrBlank()) return name
                    }
                }
        } catch (_: Exception) {
            // Fall back to the last path segment.
        }
        return uri.lastPathSegment?.substringAfterLast('/').orEmpty().ifEmpty { "Audio" }
    }

    private fun listAudioInTree(treeUri: Uri, recursive: Boolean): List<Map<String, String>> {
        val resolver = reactContext?.contentResolver
            ?: throw IllegalStateException("React context is not available")
        val found = mutableListOf<Map<String, String>>()

        fun walk(parentDocumentId: String, depth: Int) {
            val children = DocumentsContract.buildChildDocumentsUriUsingTree(
                treeUri,
                parentDocumentId,
            )
            resolver.query(
                children,
                arrayOf(
                    DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                    DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                    DocumentsContract.Document.COLUMN_MIME_TYPE,
                ),
                null,
                null,
                null,
            )?.use { cursor ->
                while (cursor.moveToNext()) {
                    val documentId = cursor.getString(0) ?: continue
                    val name = cursor.getString(1).orEmpty()
                    val mimeType = cursor.getString(2).orEmpty()
                    if (mimeType == DocumentsContract.Document.MIME_TYPE_DIR) {
                        if (recursive && depth < MAX_FOLDER_DEPTH) walk(documentId, depth + 1)
                    } else if (isAudio(name, mimeType)) {
                        found.add(
                            mapOf(
                                "uri" to DocumentsContract
                                    .buildDocumentUriUsingTree(treeUri, documentId)
                                    .toString(),
                                "name" to name,
                            ),
                        )
                    }
                }
            }
        }

        walk(DocumentsContract.getTreeDocumentId(treeUri), 0)
        return found.sortedBy { it["name"].orEmpty().lowercase() }
    }

    private fun isAudio(name: String, mimeType: String): Boolean =
        mimeType.startsWith("audio/") ||
            AUDIO_EXTENSIONS.any { name.endsWith(it, ignoreCase = true) }

    override fun definition() = ModuleDefinition {
        Name("NativeBackgroundMusic")

        Events("onTrackChanged", "onEnded", "onError")

        OnCreate {
            reactContext?.addActivityEventListener(activityEventListener)
        }

        OnDestroy {
            reactContext?.removeActivityEventListener(activityEventListener)
            pendingPick?.reject("ECANCELLED", "Native background music module invalidated", null)
            pendingPick = null
            if (playerDelegate.isInitialized()) player.release()
        }

        AsyncFunction("pickAudioFiles") { promise: Promise ->
            val activity = appContext.currentActivity
            if (activity == null) {
                promise.reject("ENOACTIVITY", "A visible activity is required to select audio", null)
            } else if (pendingPick != null) {
                promise.reject("EBUSY", "Another audio selection is already active", null)
            } else {
                pendingPick = promise
                val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "audio/*"
                    putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                    addFlags(
                        Intent.FLAG_GRANT_READ_URI_PERMISSION or
                            Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION,
                    )
                }
                activity.startActivityForResult(intent, PICK_AUDIO_REQUEST)
            }
        }

        AsyncFunction("listTracks") { treeUri: String, recursive: Boolean ->
            listAudioInTree(Uri.parse(treeUri), recursive)
        }

        Function("setQueue") { uris: List<String>, startIndex: Int, shuffle: Boolean ->
            player.setQueue(uris, startIndex, shuffle)
        }
        Function("play") { player.play() }
        Function("pause") { player.pause() }
        Function("stop") { player.stop() }
        Function("next") { player.next() }
        Function("previous") { player.previous() }
        Function("setVolume") { volume: Double -> player.setVolume(volume.toFloat()) }
        Function("setPitch") { pitch: Double -> player.setPitch(pitch.toFloat()) }
        Function("setRepeat") { mode: String -> player.setRepeat(mode) }
        Function("setShuffle") { enabled: Boolean -> player.setShuffle(enabled) }
        Function("release") {
            if (playerDelegate.isInitialized()) player.release()
        }
    }

    companion object {
        private const val PICK_AUDIO_REQUEST = 48130
        private const val MAX_FOLDER_DEPTH = 8
        private val AUDIO_EXTENSIONS = listOf(
            ".mp3", ".m4a", ".aac", ".ogg", ".oga", ".opus", ".wav", ".flac", ".mid", ".midi",
        )
    }
}
