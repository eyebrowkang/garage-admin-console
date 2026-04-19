# garage-admin-console

Tested on [k3s].

## Description

This chart will install [garage-admin-console].

## Install

```bash
git clone https://github.com/eyebrowkang/garage-admin-console
cd garage-admin-console/helm
```

You must adjust some values first, based on your own k3s cluster using --set or -f options.

You can save some values to file with

```bash
helm show values ./garage-admin-console > values.yaml
```

You can check every resource with --dry-run mode with -f values.yaml

```bash
helm install garage-admin-console ./garage-admin-console --namespace garage-admin-console --create-namespace -f values.yaml --dry-run
```

## Uninstalling the Chart

To uninstall/delete the `garage-admin-console` deployment

```bash
helm uninstall garage-admin-console -n garage-admin-console
```

The command removes all the Kubernetes components associated with the chart and deletes the release.

## Contributing

This chart was created for [garage-admin-console],
A modern web-based administration interface for managing Garage distributed object storage clusters.

[garage-admin-console]: https://github.com/eyebrowkang/garage-admin-console
[k3s]: https://k3s.io/
[openshift]: https://www.redhat.com/en/technologies/cloud-computing/openshift/
