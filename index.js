const yaml = require('js-yaml');
const fs = require('fs');
var { l, r } = require('minimist')(process.argv.slice(2));
let cs = {
    Reset: "\x1b[0m",
    Bright: "\x1b[1m",
    Dim: "\x1b[2m",
    FgRed: "\x1b[31m",
    FgWhite: "\x1b[37m",
    FgYellow: "\x1b[33m"
}
const limits = yaml.load(fs.readFileSync(l, 'utf8'));
const resources = yaml.loadAll(fs.readFileSync(r, 'utf8'));

const limitsTemplate = (lc, lm, rc, rm) => {
    return {
        limits: {
            cpu: lc || 0,
            memory: lm || 0
        },
        requests: {
            cpu: rc || 0,
            memory: rm || 0
        }
    }
}

const parseValue = (string) => {
    if (string.includes('m')) {
        return +string.substring(0, string.length - 1) / 1000
    }
    if (string.includes('Mi')) {
        return +string.substring(0, string.length - 2)
    }
    if (string.includes('M')) {
        return +string.substring(0, string.length - 1)
    }
    if (string.includes('Gi')) {
        return +string.substring(0, string.length - 2) * 1000
    }
    if (string.includes('G')) {
        return +string.substring(0, string.length - 1) * 1000
    }
    return +string
}

const parseLimits = ({ limits, requests }) => {
    return {
        limits: {
            cpu: parseValue(limits.cpu),
            memory: parseValue(limits.memory)
        },
        requests: {
            cpu: parseValue(requests.cpu),
            memory: parseValue(requests.memory)
        }
    }
}

let totalValues = (pre, add) => {
    let final = pre
    final.limits.cpu += add.limits.cpu
    final.limits.memory += add.limits.memory
    final.requests.cpu += add.requests.cpu
    final.requests.memory += add.requests.memory
    return final
}

function Values() {
    this.total = limitsTemplate()
    this.addToTotal = (totals) => {
        this.total = totalValues(this.total, totals)
    }
    this.namespace = {}
    this.addToNamespace = (namespace, key, totals) => {

        if (!this.namespace[namespace]) {
            this.namespace[namespace] = {}
        }
        if (!this.namespace[namespace][key]) {
            this.namespace[namespace][key] = limitsTemplate()
        }
        this.namespace[namespace][key] = totalValues(this.namespace[namespace][key], totals)

    }
    this.checkQuota = (limits) => {
        let exceeded = []
        let recurse = (history, left, right) => {
            for (let key in left) {
                if (typeof left[key] == 'number') {
                    if (right[key] > left[key]) {
                        exceeded.push(`${cs.Dim}${history}.${key} exceeded! limit is ${cs.FgRed + cs.Bright}${left[key]}${cs.FgWhite + cs.Dim}. value calculated is ${cs.FgYellow + cs.Bright}${right[key]}${cs.Reset}`)
                    }
                } else {
                    recurse(`${history}.${key}`, left[key], right[key])
                }
            }
        }
        recurse('quota', limits, this)
        return exceeded
    }
}

let values = new Values();

resources.map(resource => {

    let sidecar = limitsTemplate(
        resource.spec.template.metadata.annotations['sidecar.istio.io/proxyCPULimit'],
        resource.spec.template.metadata.annotations['sidecar.istio.io/proxyMemoryLimit'],
        resource.spec.template.metadata.annotations['sidecar.istio.io/proxyCPU'],
        resource.spec.template.metadata.annotations['sidecar.istio.io/proxyMemory']
    )

    values.addToNamespace(resource.metadata.namespace, 'total', parseLimits(sidecar))
    values.addToNamespace(resource.metadata.namespace, 'sidecars', parseLimits(sidecar))

    resource.spec.template.spec.containers.map(container => {
        values.addToTotal(parseLimits(container.resources))
        values.addToNamespace(resource.metadata.namespace, 'total', parseLimits(container.resources))
        values.addToNamespace(resource.metadata.namespace, 'containers', parseLimits(container.resources))
    })

    resource.spec.template.spec.initContainers.map(container => {
        values.addToTotal(parseLimits(container.resources))
        values.addToNamespace(resource.metadata.namespace, 'total', parseLimits(container.resources))
        values.addToNamespace(resource.metadata.namespace, 'initContainers', parseLimits(container.resources))
    })
})

let results = values.checkQuota(limits)

results.map(result => console.log(result))

results.length > 0 ? process.exit(1) : process.exit(0)

