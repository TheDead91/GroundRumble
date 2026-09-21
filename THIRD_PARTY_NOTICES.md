# Third-Party Notices

GroundRumble incorporates the following third-party components and data. Their
respective licenses are listed here for attribution.

## MITRE ATLAS framework data

- **Project**: MITRE ATLAS — Adversarial Threat Landscape for Artificial-Intelligence Systems
- **Source**: <https://atlas.mitre.org/> · <https://github.com/mitre-atlas/atlas-data>
- **Copyright**: The MITRE Corporation
- **License**: Apache License 2.0 (<https://www.apache.org/licenses/LICENSE-2.0>)
- **Usage**: A bundled, pre-loaded copy of the ATLAS tactic/technique matrix is
  shipped in `src/data/atlas-bundled.js` so the app works offline. The live
  matrix can also be synced from the official `mitre-atlas/atlas-data` repo.

GroundRumble is an independent project and is **not affiliated with, endorsed
by, or sponsored by The MITRE Corporation**. "MITRE", "MITRE ATLAS", and
"ATLAS" are trademarks of The MITRE Corporation. They are used here only to
refer to the framework that test payloads are mapped to.

## MITRE ATLAS bundled data — Apache License 2.0 notice

```
Copyright The MITRE Corporation

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

## Open-source research and attack-pattern sources

Some attack payloads and test archetypes are derived from open-source research
and tools. Where applicable, attribution is kept alongside the affected test
payloads in the application and the relevant upstream license (typically
Apache-2.0 or MIT) applies to those portions.

## Node dependencies

GroundRumble's npm dependencies are installed from the npm registry under
their respective licenses (`react`, `react-dom`, `lucide-react`,
`@mozilla/readability`, `js-yaml`, and development tooling). See
`package-lock.json` for exact versions and the projects' own license terms.

---

GroundRumble itself is licensed under the MIT License — see `LICENSE`.
