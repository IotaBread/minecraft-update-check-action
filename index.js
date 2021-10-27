const core = require('@actions/core');
const cache = require('@actions/cache');
const https = require('https');
const fs = require('fs');

class Version {
    constructor(id, type, url) {
        this.id = id;
        this.type = type;
        this.url = url;
    }

    toString() {
        return this.id + "@" + this.type;
    }
}

// Constants
const cachePaths = ['./.cache/*.json'];
const manifestPath = './.cache/version_manifest_v2.json';
const prevManifestPath = './version_manifest_v2.json';

let manifestUrl = core.getInput('version-manifest-url');
if (!manifestUrl) {
    manifestUrl = 'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json';
}

let restoreKey = core.getInput('cache-base-key');
if (!restoreKey) {
    restoreKey = 'mc-update-manifest-';
}

const debugDisableCacheStoring = core.getBooleanInput('debug-disable-cache-storing');

async function main(onError) {
    try {
        core.debug("Downloading cached manifest");
        let prevManifest;
        try {
            // Get last version manifest
            await cache.restoreCache(cachePaths, restoreKey + '0', // placeholder string, it should never match
                [restoreKey]);
            if (fs.existsSync(manifestPath)) {
                fs.renameSync(manifestPath, prevManifestPath);
                const prevManifestData = fs.readFileSync(prevManifestPath, 'utf8');

                prevManifest = JSON.parse(prevManifestData);
                core.debug(prevManifestData);
            }
        } catch (error) {
            core.debug(error.message);
            core.debug(error.stack);
        }

        if (!fs.existsSync('./.cache/')) {
            core.debug("Creating `./.cache` directory");
            fs.mkdirSync('./.cache/')
        }

        core.debug("Downloading manifest");
        const newManifestStream = fs.createWriteStream(manifestPath);
        https.get(manifestUrl, res => {
            res.pipe(newManifestStream);

            res.on('error', err => {
                onError(err);
            });
            newManifestStream.on('finish', () => {
                const manifestData = fs.readFileSync(manifestPath, 'utf8');
                core.debug(manifestData);

                const manifest = JSON.parse(manifestData);

                // Compare manifest if present
                if (prevManifest) {
                    core.debug("Comparing manifests");
                    let prevVersions = prevManifest["versions"];
                    let versions = manifest["versions"];

                    const findNewVersions = (prev, current, f) => {
                        const prevMapped = prev.map(f);
                        const currentMapped = current.map(f);
                        const spreaded = [...prev, ...current];
                        return spreaded.filter(v => !prevMapped.includes(f(v)) && currentMapped.includes(f(v)));
                    }

                    const versionFactory = v => new Version(v["id"], v["type"], v["url"]);
                    prevVersions = prevVersions.map(versionFactory);
                    versions = versions.map(versionFactory);

                    const versionToString = v => v.toString();
                    const removedVersions = findNewVersions(versions, prevVersions, versionToString);
                    const newVersions = findNewVersions(prevVersions, versions, versionToString);

                    if (newVersions.length == 1 && removedVersions.length == 0) {
                        const newVersion = newVersions[0];
                        core.info("New Minecraft version (of type '" + newVersion.type + "'): " + newVersion.id);
                        core.setOutput('id', newVersion.id);
                        core.setOutput('type', newVersion.type);
                        core.setOutput('url', newVersion.url);
                    } else {
                        if (removedVersions.length > 0) {
                            core.warning("Found removed Minecraft versions: " + removedVersions.map(versionToString).join(', '));
                        }

                        if (newVersions.length > 1) {
                            core.warning("Found more than one new Minecraft version: " + newVersions.map(versionToString).join(', '));
                        } else {
                            core.debug("No new versions found");
                        }

                        core.setOutput('id', '');
                        core.setOutput('type', '');
                        core.setOutput('url', '');
                    }
                }

                if (debugDisableCacheStoring && debugDisableCacheStoring === true) {
                    core.debug("Cache storing disabled!");
                    return;
                }

                // Upload this version manifest as cache
                core.debug("Uploading new manifest to cache");
                const key = restoreKey + Date.now();
                cache.saveCache(cachePaths, key)
                    .then(() => {
                        core.debug('Uploaded cache with key ' + key);
                    })
                    .catch(err => {
                        core.error('Failed to save version manifest to cache');
                        onError(err);
                    });
            });
        });
    } catch (error) {
        onError(error);
    }
}

main(err => {
    core.setFailed(err.message);
    core.error(err.stack);
});
