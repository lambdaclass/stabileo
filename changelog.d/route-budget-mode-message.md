### Changed
#### The route byte budget says which limit a route broke (2026-11-03)

When "Landing and app route byte budgets" fails, the message now names the limit: research
isolation, for a change that touches research code shipped to the browser, or the product
budget in `web/scripts/product-route-growth-budgets.json`. Both were reported as the same
"128 byte tolerance". The limits themselves are unchanged.
