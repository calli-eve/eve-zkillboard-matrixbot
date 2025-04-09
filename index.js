import fetch from 'node-fetch';
import moment from 'moment';
import { readFile } from 'fs/promises';
import { validateConfig } from './config.schema.js';
import { updateHealthMetrics, checkHealth } from './health.js';
import { MatrixClient } from 'matrix-js-sdk';
import crypto from 'node:crypto';

// Polyfill for Web Crypto API
if (typeof globalThis.crypto === 'undefined') {
    globalThis.crypto = crypto.webcrypto;
}

// Load and validate configuration
const config = JSON.parse(await readFile('./config.json', 'utf-8'));
const validatedConfig = validateConfig(config);

// Initialize Matrix client
const matrixClient = new MatrixClient({
    baseUrl: validatedConfig.matrix.homeserverUrl,
    accessToken: validatedConfig.matrix.accessToken,
    userId: '@zkillbot:matrix.org' // This will be replaced with the actual user ID after login
});

// Create a set of watched IDs for faster lookups
const WATCHED_IDS = new Set(validatedConfig.watchedIds);

// Cache for ESI lookups
const cache = {
    characters: new Map(),
    ships: new Map(),
    systems: new Map(),
    corporations: new Map(),
    alliances: new Map()
};

// Create a simple HTTP server for health checks
const server = new (await import('http')).createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(checkHealth()));
    } else {
        res.writeHead(404);
        res.end();
    }
});
server.listen(8080);

const fetchFromESI = async (path) => {
    try {
        const response = await fetch(`https://esi.evetech.net/latest${path}`, {
            headers: {
                'User-Agent': validatedConfig.userAgent
            }
        });
        if (!response.ok) throw new Error(`ESI HTTP error! status: ${response.status}`);
        updateHealthMetrics('esi');
        return await response.json();
    } catch (error) {
        console.error(`ESI Error (${path}):`, error);
        return null;
    }
};

const getCharacterInfo = async (characterId) => {
    if (!characterId) return { name: 'Unknown' };
    if (cache.characters.has(characterId)) return cache.characters.get(characterId);
    
    const info = await fetchFromESI(`/characters/${characterId}/`);
    if (info) {
        cache.characters.set(characterId, info);
        return info;
    }
    return { name: 'Unknown' };
};

const getShipInfo = async (shipTypeId) => {
    if (!shipTypeId) return { name: 'Unknown Ship' };
    if (cache.ships.has(shipTypeId)) return cache.ships.get(shipTypeId);
    
    const info = await fetchFromESI(`/universe/types/${shipTypeId}/`);
    if (info) {
        cache.ships.set(shipTypeId, info);
        return info;
    }
    return { name: 'Unknown Ship' };
};

const getSystemInfo = async (systemId) => {
    if (!systemId) return { name: 'Unknown System' };
    if (cache.systems.has(systemId)) return cache.systems.get(systemId);
    
    const info = await fetchFromESI(`/universe/systems/${systemId}/`);
    if (info) {
        cache.systems.set(systemId, info);
        return info;
    }
    return { name: 'Unknown System' };
};

const getCorpInfo = async (corpId) => {
    if (!corpId) return { name: 'Unknown' };
    if (cache.corporations.has(corpId)) return cache.corporations.get(corpId);
    
    const info = await fetchFromESI(`/corporations/${corpId}/`);
    if (info) {
        cache.corporations.set(corpId, info);
        return info;
    }
    return { name: 'Unknown' };
};

const getAllianceInfo = async (allianceId) => {
    if (!allianceId) return null;
    if (cache.alliances.has(allianceId)) return cache.alliances.get(allianceId);
    
    const info = await fetchFromESI(`/alliances/${allianceId}/`);
    if (info) {
        cache.alliances.set(allianceId, info);
        return info;
    }
    return null;
};

const formatMatrixMessage = async (killmail, relevanceCheck, zkb) => {
    try {
        // Fetch all required information
        const victim = await getCharacterInfo(killmail.victim.character_id);
        const victimCorp = await getCorpInfo(killmail.victim.corporation_id);
        const victimAlliance = killmail.victim.alliance_id ? 
            await getAllianceInfo(killmail.victim.alliance_id) : null;
        const shipType = await getShipInfo(killmail.victim.ship_type_id);
        const system = await getSystemInfo(killmail.solar_system_id);
        
        const time = moment(killmail.killmail_time).format('DD-MM-YYYY HH:mm');
        const isKill = relevanceCheck.reason === 'attacker';
        
        // Format victim affiliation
        const victimAffiliation = [
            `<a href="https://zkillboard.com/corporation/${killmail.victim.corporation_id}/">${victimCorp.name}</a>`,
            victimAlliance ? `<a href="https://zkillboard.com/alliance/${killmail.victim.alliance_id}/">${victimAlliance.name}</a>` : ''
        ].filter(Boolean).join(' ');

        // Get final blow attacker info
        const finalBlowAttacker = killmail.attackers.find(a => a.final_blow);
        const finalBlowChar = await getCharacterInfo(finalBlowAttacker.character_id);

        // Get top damage attacker info
        const topDamageAttacker = killmail.attackers.reduce((prev, current) => 
            (current.damage_done > prev.damage_done) ? current : prev
        );
        const topDamageChar = await getCharacterInfo(topDamageAttacker.character_id);

        // Count and get attacker ships info
        const attackerShips = new Map();
        killmail.attackers.forEach(attacker => {
            const count = attackerShips.get(attacker.ship_type_id) || 0;
            attackerShips.set(attacker.ship_type_id, count + 1);
        });
        const [mostUsedShipId, shipCount] = [...attackerShips.entries()]
            .reduce((a, b) => (a[1] > b[1] ? a : b));
        const attackerShipInfo = await getShipInfo(mostUsedShipId);

        // Download and upload ship image
        const imageUrl = `https://images.evetech.net/types/${killmail.victim.ship_type_id}/icon?size=128`;
        const imageResponse = await fetch(imageUrl);
        const imageBuffer = await imageResponse.arrayBuffer();
        const imageUpload = await matrixClient.uploadContent(
            Buffer.from(imageBuffer),
            {
                name: `${shipType.name}.png`,
                type: 'image/png'
            }
        );

        // Format the message in Markdown and HTML
        const plainText = `_${time}_ [zKill](https://zkillboard.com/kill/${killmail.killmail_id}/)\n` +
                         `[${victim.name}](https://zkillboard.com/character/${killmail.victim.character_id}/) ${victimAffiliation}\n` +
                         `${shipType.name} in ${system.name}\n\n` +
                         `**Final Blow**: ${finalBlowChar.name}\n` +
                         `**Top Damage**: ${topDamageChar.name}\n` +
                         `**Attacker Ship**: ${attackerShipInfo.name} (${shipCount})\n\n` +
                         `Estimated value: ${new Intl.NumberFormat('en-US', {
                             maximumFractionDigits: 0
                         }).format(zkb.totalValue)} ISK`;

        const statusColor = isKill ? '#4CAF50' : '#F44336'; // Green for kills, Red for losses
        const statusText = isKill ? 'KILL' : 'LOSS';
        const statusEmoji = isKill ? '🎯' : '💀';

        const html = `
            <div style="background-color: ${statusColor}20; padding: 10px; border-radius: 5px; margin: 5px 0; border-left: 4px solid ${statusColor};">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <img src="${imageUpload.content_uri}" 
                         alt="${shipType.name}" 
                         style="width: 64px; height: 64px; border-radius: 5px;"/>
                    <div style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">
                            <span style="background-color: ${statusColor}; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; font-weight: bold;">
                                ${statusEmoji} ${statusText}
                            </span>
                            <span style="font-size: 0.9em; color: #666;">
                                <em>${time}</em> • 
                                <a href="https://zkillboard.com/kill/${killmail.killmail_id}/">zKill</a>
                            </span>
                        </div>
                        <div style="font-weight: bold; margin: 5px 0;">
                            <a href="https://zkillboard.com/character/${killmail.victim.character_id}/">${victim.name}</a>
                            <span style="color: #666;">${victimAffiliation}</span>
                        </div>
                        <div>
                            ${shipType.name} in ${system.name}
                        </div>
                    </div>
                </div>
                <div style="margin-top: 10px; padding: 10px; background-color: white; border-radius: 5px;">
                    <div><strong>Final Blow:</strong> ${finalBlowChar.name}</div>
                    <div><strong>Top Damage:</strong> ${topDamageChar.name}</div>
                    <div><strong>Attacker Ship:</strong> ${attackerShipInfo.name} (${shipCount})</div>
                    <div style="margin-top: 10px; color: #666;">
                        Estimated value: ${new Intl.NumberFormat('en-US', {
                            maximumFractionDigits: 0
                        }).format(zkb.totalValue)} ISK
                    </div>
                </div>
            </div>
        `;

        return {
            msgtype: 'm.text',
            body: plainText,
            format: 'org.matrix.custom.html',
            formatted_body: html
        };
    } catch (error) {
        console.error('Error formatting Matrix message:', error);
        return null;
    }
};

const postToMatrix = async (message) => {
    try {
        await matrixClient.sendEvent(validatedConfig.matrix.roomId, 'm.room.message', message);
        updateHealthMetrics('matrix');
    } catch (error) {
        console.error('Error posting to Matrix:', error);
    }
};

const checkKillmailRelevance = (killmail) => {
    // If watchedIds is empty, all kills are relevant
    if (validatedConfig.watchedIds.length === 0) {
        return {
            isRelevant: true,
            reason: 'all'
        };
    }

    // Check if victim is from watched entities
    if (WATCHED_IDS.has(killmail.victim.corporation_id) || 
        (killmail.victim.alliance_id && WATCHED_IDS.has(killmail.victim.alliance_id))) {
        return {
            isRelevant: true,
            reason: 'victim'
        };
    }

    // Check if any attacker is from watched entities
    const relevantAttacker = killmail.attackers.find(attacker => 
        WATCHED_IDS.has(attacker.corporation_id) || 
        (attacker.alliance_id && WATCHED_IDS.has(attacker.alliance_id))
    );
    
    if (relevantAttacker) {
        return {
            isRelevant: true,
            reason: 'attacker'
        };
    }

    return {
        isRelevant: false,
        reason: null
    };
};

// Replace the WebSocket implementation with RedisQ polling
const pollRedisQ = async () => {
    console.log('Starting RedisQ polling...');
    console.log(`Using queue ID: ${validatedConfig.queueId}`);
    
    while (true) {
        try {
            const response = await fetch(`https://redisq.zkillboard.com/listen.php?queueID=${validatedConfig.queueId}`, {
                headers: {
                    'User-Agent': validatedConfig.userAgent
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            updateHealthMetrics('poll');
            const data = await response.json();
            if (data.package) {
                const killmail = data.package.killmail;
                const zkb = data.package.zkb;
                const relevanceCheck = checkKillmailRelevance(killmail);
                
                if (relevanceCheck.isRelevant) {
                    const message = await formatMatrixMessage(killmail, relevanceCheck, zkb);
                    if(!message) return;

                    await postToMatrix(message);
                }
            } else {
                // Small delay to prevent hammering the API
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
            
        } catch (error) {
            console.error('Error polling RedisQ:', error);
            
            // Exit process on specific connection errors
            if (error.message.includes('502') || 
                error.message.includes('socket hang up') || 
                error.code === 'ECONNRESET') {
                console.error('Fatal connection error detected. Exiting process...');
                process.exit(1);
            }
            
        }
    }
};

console.log('Starting zKillboard RedisQ listener...');
if (validatedConfig.watchedIds.length > 0) {
    console.log(`Watching ${validatedConfig.watchedIds.length} entities`);
} else {
    console.log('Watching all killmails');
}
pollRedisQ(); 