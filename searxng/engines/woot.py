"""
GraphQL Offers (GET-only) engine.

Usage:
- Copy this file to searx/engines/graphql_offers.py
- Add the YAML config below to settings.yml
- Restart SearxNG

Capabilities:
- GET-based GraphQL query with variables
- Pagination via Skip/Limit
- Client-side filtering (case-insensitive, AND over tokens)

Config options (set in settings.yml):
- base_url:         GraphQL endpoint, e.g. "https://example.com/graphql"
- categories_filter: list of category strings passed to GraphQL
- limit:            page size (int)
- headers:          optional dict of extra HTTP headers (e.g., auth)

"""

import json
from typing import Any, Dict, Iterable, List

# --- Engine metadata ---
about = {
    "website": "custom",
    "wikidata_id": None,
    "official_api_documentation": None,
    "use_official_api": False,
    "require_api_key": False,
    "results": "Woot offers",
}

# Enable pagination (SearxNG will pass pageno starting at 1)
paging = True

# SearxNG categories this engine participates in (UI filter), not your GraphQL ones
categories = ["general"]

# Defaults, override via settings.yml -> engines -> this_engine -> <key>
base_url: str = "https://d24qg5zsx8xdc4.cloudfront.net/graphql"
categories_filter: List[str] = [
    "home", "tech", "pc", "tools", "sport", "grocery"
]
# It crashes beyond 424
limit: int = 424
headers: Dict[str, str] = {
    "accept": "application/json",
    # No I'm not leaking the key, this is the public key used on woot.com
    "x-api-key": "da2-hk2jpo7aljfvxollvmieghuqlu"
}

# ---------------- GraphQL ----------------

# Use variables so the query stays short; server must accept GET with variables param.
GQL_QUERY = """
query SearchOffers($cats: [String!]!, $limit: Int!, $skip: Int!) {
  searchOffers(
    Filter: { Categories: $cats, IsSoldOut: { exclude: true } }
    Sort: DiscountPercentage
    Limit: $limit
    Skip: $skip
  ) {
    Offers {
      Id
      IsAppFeatured
      IsFeatured
      SoldOut
      Title
      Photos { Width Height Url }
      EndDate
      Items {
        ListPrice
        SalePrice
        Attributes { Key Value }
      }
      Slug
    }
    TotalHits
  }
}
""".strip()


def _tokenize(q: str) -> List[str]:
    return [t for t in (q or "").strip().split() if t]


def _ci_contains(hay: str, needle: str) -> bool:
    return needle.lower() in (hay or "").lower()


def _offer_matches_query(offer: Dict[str, Any], query: str) -> bool:
    """Case-insensitive AND over tokens against Title, Slug, and Attributes."""
    tokens = _tokenize(query)
    if not tokens:
        return True  # No query -> include all

    title = offer.get("Title") or ""
    slug = offer.get("Slug") or ""
    attrs = offer.get("Items") or []

    # Flatten attributes "Key:Value" strings for matching
    attr_texts: List[str] = []
    for item in attrs:
        for kv in (item.get("Attributes") or []):
            k = kv.get("Key") or ""
            v = kv.get("Value") or ""
            if k or v:
                attr_texts.append(f"{k}:{v}")

    def matches_token(tok: str) -> bool:
        if _ci_contains(title, tok) or _ci_contains(slug, tok):
            return True
        for s in attr_texts:
            if _ci_contains(s, tok):
                return True
        return False

    # AND semantics: every token must match somewhere
    return all(matches_token(t) for t in tokens)


def _first_photo_url(offer: Dict[str, Any]) -> str:
    photos = offer.get("Photos") or []
    if photos:
        # Prefer the first photo URL; customize if you need WxH selection
        return photos[0].get("Url") or ""
    return ""


def _price_block(offer: Dict[str, Any]) -> str:
    items = offer.get("Items") or []
    # Build a compact content string showing prices/attributes
    parts: List[str] = []
    for it in items:
        lp = it.get("ListPrice")
        sp = it.get("SalePrice")
        if sp is not None and lp is not None:
            parts.append(f"{sp} (was {lp})")
        elif sp is not None:
            parts.append(f"{sp}")
        elif lp is not None:
            parts.append(f"{lp}")
    return " · ".join(parts)


def _build_offer_url(offer: Dict[str, Any]) -> str:
    slug = offer.get("Slug") or ""
    if slug:
        return f"https://sellout.woot.com/offers/{slug}"
    return "https://sellout.woot.com/offers/"


# --------------- SearxNG entrypoints ----------------


def request(query: str, params: Dict[str, Any]) -> Dict[str, Any]:
    """Build a GET /graphql with variables and headers.

    SearxNG will call this with the user's query string and pageno.
    """
    global limit, base_url, headers, categories_filter

    pageno = int(params.get("pageno", 1)) or 1
    page_limit = int(params.get("limit")
                     or limit)  # allow override via settings.yml
    skip = max(0, (pageno - 1) * page_limit)

    variables = {
        "cats": categories_filter,
        "limit": page_limit,
        "skip": skip,
    }

    params.update({
        "url": base_url,
        "method": "GET",
        "headers": headers,
        "params": {
            # GraphQL GET pattern: ?query=...&variables=... (JSON-encoded)
            "query": GQL_QUERY,
            "variables": json.dumps(variables, separators=(",", ":")),
        },
    })

    return params


def response(resp) -> Iterable[Dict[str, Any]]:
    """Parse JSON, filter by query, and yield SearxNG result dicts."""
    try:
        data = resp.json()
    except Exception:
        return

    root = ((data or {}).get("data") or {}).get("searchOffers") or {}
    offers = root.get("Offers") or []
    total_hits = root.get("TotalHits") or 0

    # Searx query string is available on resp.search_params.get('query')
    # (SearxNG attaches request()'s 'query' argument to search_params)
    searx_query = (getattr(resp, "search_params", {}) or {}).get("query",
                                                                 "") or ""

    # Filter offers client-side (case-insensitive AND semantics)
    for off in offers:
        if not _offer_matches_query(off, searx_query):
            continue

        title = off.get("Title") or "(no title)"
        url = _build_offer_url(off)
        img = _first_photo_url(off)

        content_bits: List[str] = []
        if off.get("IsFeatured"):
            content_bits.append("Featured")
        if off.get("IsAppFeatured"):
            content_bits.append("App-Featured")
        if off.get("SoldOut"):
            content_bits.append("SOLD OUT")

        price = _price_block(off)
        if price:
            content_bits.append(price)

        end_date = off.get("EndDate")
        if end_date:
            content_bits.append(f"Ends: {end_date}")

        content = " · ".join(content_bits)

        yield {
            "title": title,
            "url": url,
            "content": content,
            "img_src": img or None,
            # Optional extra fields that some Searx templates can surface:
            "thumbnail": img or None,
        }

    # Let SearxNG know about total results if you want better page counts
    # (some themes read this). It’s optional.
    if hasattr(resp, "set_number_of_results"):
        try:
            resp.set_number_of_results(int(total_hits))
        except Exception:
            pass
