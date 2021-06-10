addEventListener('fetch', event => {
    event.passThroughOnException();

    event.respondWith(handleEvent(event));
})

async function handleEvent(event) {
    let headers = new Headers({
        "content-type": "application/json"
    })

    if (!verifyRequestSignature(event.request)) {
        unauthorizedResponse();
    }

    try {
        return await doOriginalRequestWithTimeout(event);
    } catch (err) {
        if(err == "timeout"){
            return deferResponse();
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

function deferResponse(flags) {
    const body = JSON.stringify({
        type: 5,
        data: {
            flags: flags
        }
    })
    return new Response(body, {
        headers: headers
    })
}

function doOriginalRequestWithTimeout(event) {
    return new Promise( (resolve, reject) => {
        let timedOut = false;
        let timeout = setTimeout(() => {
            timedOut = true;
            reject("timeout");
        }, 2500);

        let task = async function(req) {
            let resp = await fetch(req.clone());
            let respData = await req.json();
            let requestData = req.data();

            if (timedOut) {
                await patchOriginalMessage(requestData.application_id, requestData.token, respData);
            } else {
                clearTimeout(timeout);
                resolve(resp);
            }
        }

        event.waitUntil(task(event.request));
    })
}

const DISCORD_BASE_URL = "https://discord.com/api/v8"

async function patchOriginalMessage(applicationId, interactionToken, data) {
    let url = `${DISCORD_BASE_URL}/webhooks/${applicationId}/${interactionToken}/messages/@original?wait=true`

    let resp = await fetch(url, {
        method: "PATCH",
        headers: {"content-type": "application/json"},
        body: data
    });
}

function getFlags() {
    return 
}

async function verifyRequestSignature(request) {
    return true
}
