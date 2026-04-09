import pandas as pd

from billing_bridge.normalize import apply_alias_map


def test_alias_map_resolves_richard():
    df = pd.DataFrame([{"person": "Rich Perez"}])
    aliases = pd.DataFrame([{"alias_name": "Rich Perez", "canonical_name": "Richard Perez"}])
    out = apply_alias_map(df, "person", aliases)
    assert out.iloc[0]["canonical_name"] == "Richard Perez"
