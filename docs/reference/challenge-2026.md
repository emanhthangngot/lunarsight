# NASA Space Apps 2026 — Lunar Landing Site Navigator (official challenge summary)

Status: **reference summary, paraphrased**. It records what the challenge asks; it is not a project requirement or decision.

- Source: [Lunar Landing Site Navigator](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/).
- Retrieval method and date: the Details and Resources tabs were retrieved on **13 November 2026** through the site's GraphQL API (`api.spaceappschallenge.org/graphql`, `pageByPath`); page `lastPublishedAt` 2026-11-13T03:46:21Z. Direct HTML retrieval had returned HTTP 502 earlier. The page says more resources may be added before the hackathon.
- Categories: Advanced, Intermediate. Skills: Human Exploration, Moon, Software, Space Exploration.

## Problem

Missions to the Moon's south pole face extreme lighting and communication constraints. Tools for Sun and Earth positions exist, but "their complicated interfaces make it difficult to evaluate critical information with efficiency." The challenge is to build an intuitive tool that lets "mission planners, educators, and the public compare landing sites and dates quickly, visualizing Sun and Earth positions relative to the horizon to assess power generation potential and direct-to-Earth communication windows."

Small changes in site or date can change power and communication windows dramatically; schedule slips force quick evaluation of alternative sites or dates.

## Objectives (all phrased as "may consider")

- Site selection and comparison: curated notable sites (Apollo, CLPS targets, other commercial or national programs) plus custom coordinates; side-by-side or sequential comparison.
- Date/time flexibility across lunar days or seasons.
- Sun and Earth position relative to the horizon at a site and date; time remaining before sunset or Earthset.
- Power and communication assessment: solar elevation, sunlight duration, Earth visibility windows.
- Multiple visualizations: 2D maps, 3D surfaces, or other creative forms.
- Temporal dynamics: animations or timelines over a lunar day or several days.
- Accessibility across skill levels (planners, educators, public).

## Potential considerations

- Ephemeris from JPL Horizons or pre-computed datasets.
- LOLA topography for realistic surfaces and horizon calculation.
- No atmosphere: the horizon is set by local terrain and the edge of the lunar sphere; no refraction.
- Solar elevation as a key, prominent metric.
- UX: rapid scenario comparison; clear time remaining; make lunar/terrestrial differences apparent.
- Accuracy: real topography; libration and orbital variations; steep slopes and deep craters at the south pole.

## Resources tab

| Resource | Official description (paraphrased) | URL |
| --- | --- | --- |
| Quickmap (ASU) | Interactive mapping of LRO imagery and topography. | <https://quickmap.lroc.asu.edu/> (301 → <https://quickmap.lroc.im-ldi.com/>) |
| Moon Trek (NASA) | Interactive 3D lunar visualization. | <https://trek.nasa.gov/moon/> |
| Horizons System (JPL) | Ephemeris for the Sun and Earth as seen from lunar sites. | <https://ssd.jpl.nasa.gov/horizons/> |
| CSA Moon Exploration | Outreach/context portal; no data products found. | <https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/> |

The page notes non-U.S. Government sites are not endorsed by NASA and that participants must follow each site's data-use terms.

## Use in this repository

Candidate data observations from these resources are in [data-sources.md](../data-sources.md); none is selected. Product direction and requirements remain in [product.md](../product.md) and [requirements.md](../requirements.md). The 2026 judging guidelines were not found; the 2025 guidelines list Impact, Creativity, Validity, Relevance and Presentation [reference only, not verified for 2026].
