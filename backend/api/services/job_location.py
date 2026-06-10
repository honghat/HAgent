from __future__ import annotations

import unicodedata

LOCATION_LABELS: dict[str, str] = {
    "hcm": "TP. HCM",
    "hn": "Hà Nội",
    "dn": "Đà Nẵng",
    "ct": "Cần Thơ",
    "hp": "Hải Phòng",
    "bd": "Bình Dương",
    "dni": "Đồng Nai",
    "remote": "Remote",
}

_ALIASES: dict[str, tuple[str, ...]] = {
    "hcm": ("hcm", "tphcm", "tp hcm", "tp.hcm", "ho chi minh", "ho chi minh city",
            "hochiminh", "saigon", "sai gon", "sg", "thu duc"),
    "hn": ("hn", "ha noi", "hanoi"),
    "dn": ("dn", "da nang", "danang"),
    "ct": ("ct", "can tho", "cantho"),
    "hp": ("hp", "hai phong", "haiphong"),
    "bd": ("bd", "binh duong", "binhduong", "thu dau mot"),
    "dni": ("dni", "dong nai", "dongnai", "bien hoa"),
    "remote": ("remote", "wfh", "work from home", "lam tai nha", "online", "tu xa"),
}


def _strip_accents(text: str) -> str:
    nfkd = unicodedata.normalize("NFD", text)
    stripped = "".join(c for c in nfkd if not unicodedata.combining(c))
    return stripped.replace("đ", "d").replace("Đ", "D")


def canonical_location(raw: str | None) -> str | None:
    if not raw:
        return None
    plain = _strip_accents(str(raw)).lower().strip()
    if not plain:
        return None
    for key, aliases in _ALIASES.items():
        for alias in aliases:
            if alias in plain:
                return key
    return None


def canonical_locations(raw: str | None) -> list[str]:
    """A JD location string may list multiple cities (e.g. 'HCM & Hà Nội')."""
    if not raw:
        return []
    plain = _strip_accents(str(raw)).lower()
    hits: list[str] = []
    for key, aliases in _ALIASES.items():
        for alias in aliases:
            if alias in plain and key not in hits:
                hits.append(key)
                break
    return hits
