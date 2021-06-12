import { config } from "./config.js"

addEventListener('fetch', event => {
    event.passThroughOnException();

    event.respondWith(handleEvent(event));
})

async function handleEvent(event) {
    let isEphemeral = config.defaultEphemeral;

    if (!verifyRequestSignature(event.request.clone())) {
        unauthorizedResponse();
    }

    try {
        return await doOriginalRequestWithTimeout(event, isEphemeral);
    } catch (err) {
        if(err == "timeout") {
            if(isEphemeral) {
                return deferResponse(64);
            }

            return deferResponse(0);
        } else {
            throw err;
        }
    }
}

function unauthorizedResponse() {
    return new Response('{"message": "unauthorized"}', {
        headers: {
            "content-type": "application/json"
        }
    }, 401)
}

function deferResponse(flags=0) {
    const body = JSON.stringify({
        type: 5,
        data: {
            flags: flags
        }
    })
    return new Response(body, {
        headers: {
            "content-type": "application/json"
        }
    })
}

function doOriginalRequestWithTimeout(event, isEphemeral) {
    return new Promise( (resolve, reject) => {
        let timedOut = false;
        let timeout = setTimeout(() => {
            timedOut = true;
            reject("timeout");
        }, 2000);

        let task = async function(req) {
            const requestData = await req.clone().json();
            const resp = await fetch(req);
            const respJson = await resp.clone().json();
            const respData = respJson.data;

            if (timedOut) {
                console.log(isEphemeral, respData);
                if(isEphemeral == (respData.flags == 64)) {
                    await patchOriginalMessage(requestData.application_id, requestData.token, respData);
                } else {
                    await deleteOriginalMessage(requestData.application_id, requestData.token);
                    await doFollowupMessage(requestData.application_id, requestData.token, respData);
                }
            } else {
                clearTimeout(timeout);
                resolve(resp);
            }
        }

        event.waitUntil(task(event.request));
    })
}

const DISCORD_BASE_URL = "https://discord.com/api/v8"

async function doFollowupMessage(applicationId, interactionToken, data) {
    let url = `${DISCORD_BASE_URL}/webhooks/${applicationId}/${interactionToken}`
    let body = JSON.stringify(data);
    
    console.log("doing followup message");
    let resp = await fetch(url, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: body
    });
    console.log(resp);
}

async function patchOriginalMessage(applicationId, interactionToken, data) {
    let url = `${DISCORD_BASE_URL}/webhooks/${applicationId}/${interactionToken}/messages/@original?wait=true`
    let body = JSON.stringify(data);
    
    console.log("updating original message");
    let resp = await fetch(url, {
        method: "PATCH",
        headers: {"Content-Type": "application/json"},
        body: body
    });
}


async function deleteOriginalMessage(applicationId, interactionToken) {
    let url = `${DISCORD_BASE_URL}/webhooks/${applicationId}/${interactionToken}/messages/@original`

    console.log("deleting original message");
    let resp = await fetch(url, {
        method: "DELETE",
        headers: {"Content-Type": "application/json"}
    });
}

function verifyRequestSignature(request) {
    return true;
}
