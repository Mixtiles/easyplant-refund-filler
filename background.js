/* global util */

const EASYPLANT_SHOPIFY_STORE_NAME = 'mt-ep'
const EASYPLANT_SHOPIFY_TAGS_CSV_ID = '1bJj8catep_ga2I0sRLGbMIJlPDHxkXCd'
const EASYPLANT_SHOPIFY_TAGS_CSV_ADDRESS = `https://drive.google.com/uc?export=download&id=${EASYPLANT_SHOPIFY_TAGS_CSV_ID}`
const SHOPIFY_REFUND_REGEX_MATCHER = new RegExp(
    `https?:\/\/${EASYPLANT_SHOPIFY_STORE_NAME}\.myshopify\.com\/admin\/orders\/.*\/refund`
)

const OPTION_AUTOCOMPLETE_KEY = 'autocompleteEnabled'
const OPTION_ITEMS_KEY = 'items'
const OPTION_MATCH_ONLY_AT_BEGINNING = 'matchOnlyAtBeginning'
const OPTION_USE_TAB_KEY = 'useTabToChooseItems'

let autocompleteEnabled
let itemString
let matchOnlyAtBeginning

let useTabToChooseItems

updateShopifyTags().then(() => {
    browser.storage.local
        .get([
            OPTION_AUTOCOMPLETE_KEY,
            OPTION_MATCH_ONLY_AT_BEGINNING,
            OPTION_USE_TAB_KEY
        ])
        .then(result => {
            if (result[OPTION_AUTOCOMPLETE_KEY] === undefined) {
                browser.storage.local.set({ [OPTION_AUTOCOMPLETE_KEY]: true })
            } else {
                enableDisableAutocomplete(result[OPTION_AUTOCOMPLETE_KEY])
            }

            if (result[OPTION_USE_TAB_KEY] === undefined) {
                browser.storage.local.set({ [OPTION_USE_TAB_KEY]: true })
            } else {
                useTabToChooseItems = result[OPTION_USE_TAB_KEY]
            }

            if (result[OPTION_MATCH_ONLY_AT_BEGINNING] === undefined) {
                browser.storage.local.set({
                    [OPTION_MATCH_ONLY_AT_BEGINNING]: false
                })
            } else {
                matchOnlyAtBeginning = result[OPTION_MATCH_ONLY_AT_BEGINNING]
            }
        })
})

browser.storage.onChanged.addListener(changes => {
    if (changes[OPTION_ITEMS_KEY]) {
        itemString = changes[OPTION_ITEMS_KEY].newValue
    }

    if (changes[OPTION_AUTOCOMPLETE_KEY]) {
        enableDisableAutocomplete(changes[OPTION_AUTOCOMPLETE_KEY].newValue)
    }

    if (changes[OPTION_USE_TAB_KEY]) {
        useTabToChooseItems = changes[OPTION_USE_TAB_KEY].newValue
    }

    if (changes[OPTION_MATCH_ONLY_AT_BEGINNING]) {
        matchOnlyAtBeginning = changes[OPTION_MATCH_ONLY_AT_BEGINNING].newValue
    }

    if (autocompleteEnabled) {
        sendOptionsToActiveTab()
    }
})

function getEasyplantShopifyTags () {
    return fetch(EASYPLANT_SHOPIFY_TAGS_CSV_ADDRESS)
        .then(response => response.text())
        .then(shopifyTagsString => {
            const allTags = itemStringToList(shopifyTagsString)
            allTags.shift() // Remove the "Tag" Headline from the CSV
            return allTags.join('\n')
        })
}

function sendOptions (tabId, frameId) {
    console.debug('Send items to tab ' + tabId + ' and frame ' + frameId)
    const options = {}
    if (frameId) {
        options.frameId = frameId
    }

    browser.tabs.sendMessage(
        tabId,
        {
            itemList: itemStringToList(itemString),
            useTabToChooseItems,
            minimumCharacterCount: 0,
            matchOnlyAtBeginning
        },
        options
    )
}

function itemStringToList (itemString) {
    if (!itemString) {
        return []
    }

    return itemString.split(/\r?\n/).filter(Boolean)
}

function sendOptionsToActiveTab () {
    console.debug('Send items to active tab')
    browser.tabs
        .query({ currentWindow: true, active: true })
        .then(matchingTabs => {
            sendOptions(matchingTabs[0].id)
        })
}

function setOptionItems (optionItems) {
    browser.storage.local.get([OPTION_ITEMS_KEY]).then(result => {
        if (result[OPTION_ITEMS_KEY] === undefined) {
            browser.storage.local.set({
                [OPTION_ITEMS_KEY]: optionItems
            })
        } else {
            const itemStringFromCache = result[OPTION_ITEMS_KEY]
            if (itemStringFromCache !== optionItems) {
                browser.storage.local.set({
                    [OPTION_ITEMS_KEY]: optionItems
                })
            } else {
                itemString = itemStringFromCache
            }
        }
    })
}

function updateShopifyTags () {
    return getEasyplantShopifyTags().then(setOptionItems)
}

function isEasyPlantShopifyRefundURL (url) {
    return SHOPIFY_REFUND_REGEX_MATCHER.test(url)
}

function onUpdated (tabId, changeInfo, tab) {
    // We only look for text inputs if we're at our shopify store's refund page.
    if (
        changeInfo.status == 'complete' &&
        isEasyPlantShopifyRefundURL(tab.url)
    ) {
        console.debug('New Shopify Refund page loaded, check for inputs')
        chainPromises([
            () => {
                return updateShopifyTags()
            },
            () => {
                return browser.tabs.executeScript(tabId, {
                    file: 'browser-polyfill.js',
                    allFrames: true
                })
            },
            () => {
                return browser.tabs.executeScript(tabId, {
                    file: 'content-scripts/checker.js',
                    allFrames: true
                })
            }
        ])
    }
}

function onMessage (message, sender) {
    if (message.text == 'refreshAutocomplete') {
        if (message.requireInizialization) {
            console.debug('Background got request to initialize autocompletes')
            initializeAutocomplete(sender.tab.id, sender.frameId)
        } else {
            console.debug('Background got request to refresh autocompletes')
            sendOptions(sender.tab.id, sender.frameId)
        }
    }
}

function initializeAutocomplete (tabId, frameId) {
    console.debug(
        'Initialize autocomplete for tab ' + tabId + ' and frame ' + frameId
    )
    chainPromises([
        () => {
            return browser.tabs.executeScript(tabId, {
                file: 'browser-polyfill.js',
                frameId: frameId
            })
        },
        () => {
            return browser.tabs.executeScript(tabId, {
                file: 'content-scripts/jquery-3.1.1.js',
                frameId: frameId
            })
        },
        () => {
            return browser.tabs.executeScript(tabId, {
                file: 'content-scripts/jquery-ui-1.12.1.js',
                frameId: frameId
            })
        },
        () => {
            return browser.tabs.executeScript(tabId, {
                file: 'content-scripts/autocomplete.js',
                frameId: frameId
            })
        },
        () => {
            return browser.tabs.insertCSS(tabId, {
                file: 'content-scripts/autocomplete.css',
                frameId: frameId
            })
        },
        () => {
            return sendOptions(tabId, frameId)
        }
    ])
}

function enableDisableAutocomplete (enable) {
    if (enable && !autocompleteEnabled) {
        console.debug('Enable autocomplete')
        browser.tabs.onUpdated.addListener(onUpdated)
        browser.runtime.onMessage.addListener(onMessage)
        browser.tabs.onActivated.addListener(sendOptionsToActiveTab)
        autocompleteEnabled = true
    } else if (!enable && autocompleteEnabled) {
        console.debug('Disable autocomplete')
        browser.tabs.onUpdated.removeListener(onUpdated)
        browser.runtime.onMessage.removeListener(onMessage)
        browser.tabs.onActivated.removeListener(sendOptionsToActiveTab)
        autocompleteEnabled = false
    }
}

function chainPromises (functions) {
    let promise = Promise.resolve()
    for (const function_ of functions) {
        promise = promise.then(function_)
    }

    return promise.catch(error => {
        console.warn(error.message, error.stack)
    })
}
