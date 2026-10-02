# Demo contracts
P1 uses the JSON fixtures in data/cache. All dimensions are metres, prices AED and area square feet.
Plan: id, name, area_sqft, rooms, assumptions. Room: id, name, kind, x_m, y_m, width, length, furnish, has_walk_in.
StyleProfile: tags, palette, avoid, summary.
Bundle: id, items, placements, total_aed, retail_aed, saving_pct, co2_kg, co2_is_estimate, explanation, warnings.
DetectedItem: id, title, category, suggested_price_aed, include, thumbnail_url, confidence.
All Worker responses include demo:true; health includes stage:P1, live_ai:false.
Fixtures are illustrative, not scraped listings or verified developer plans.
Prompts and live model choices are deferred to later phases.
