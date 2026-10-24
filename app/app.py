"""TrialPulse demo: ranked list of recruiting MA trials by predicted enrollment-failure risk.
Run: streamlit run app/app.py
"""
from pathlib import Path
import pandas as pd
import pydeck as pdk
import streamlit as st

PROCESSED = Path(__file__).resolve().parents[1] / "data" / "processed"
SCORED = PROCESSED / "recruiting_ma_scored.parquet"

st.set_page_config(page_title="TrialPulse", layout="wide")
st.title("TrialPulse")
st.caption("Which recruiting Massachusetts trials are at risk of failing to enroll, and who are they failing to reach?")

if not SCORED.exists():
    st.warning("No scored data yet. Run `make data` then `make train` first.")
    st.stop()

df = pd.read_parquet(SCORED)
metrics = PROCESSED / "metrics.csv"
if metrics.exists():
    st.sidebar.subheader("Model metrics (held-out, time split)")
    st.sidebar.dataframe(pd.read_csv(metrics).set_index("model").T, use_container_width=True)

st.sidebar.markdown(f"**{len(df):,}** recruiting MA trials scored")
min_risk = st.sidebar.slider("Minimum risk", 0.0, 1.0, 0.5, 0.05)
view = df[df["risk"] >= min_risk]

left, right = st.columns([3, 2])
with left:
    st.subheader("Ranked trials")
    st.dataframe(
        view[["nct_id", "title", "risk", "phases", "sponsor_class", "site_facility", "site_city"]]
        .rename(columns={"risk": "failure risk"}),
        use_container_width=True, hide_index=True, height=600,
    )
with right:
    st.subheader("Sites")
    pts = view.dropna(subset=["site_lat", "site_lon"])
    st.pydeck_chart(pdk.Deck(
        initial_view_state=pdk.ViewState(latitude=42.3, longitude=-71.8, zoom=7),
        layers=[pdk.Layer("ScatterplotLayer", data=pts, get_position="[site_lon, site_lat]",
                          get_radius="2000 + risk * 6000", get_fill_color="[255, 80 + (1-risk)*150, 60, 160]",
                          pickable=True)],
        tooltip={"text": "{title}\n{site_facility}, {site_city}\nrisk: {risk}"},
    ))
    # TODO: overlay MassGIS EJ 2020 block groups (kit: ej.zip) and CDC PLACES county prevalence (kit: places.zip)

st.subheader("Trial card")
pick = st.selectbox("Choose a trial", view["nct_id"].tolist())
row = view.set_index("nct_id").loc[pick]
st.markdown(f"### {row['title']}")
st.markdown(f"**Risk:** {row['risk']:.0%} &nbsp; **Phase:** {row['phases'] or 'n/a'} &nbsp; **Sponsor:** {row['sponsor_class']}")
st.markdown(f"**Conditions:** {row['conditions']}")
st.markdown(f"**Site:** {row['site_facility']}, {row['site_city']}")
st.markdown(f"[View on ClinicalTrials.gov](https://clinicaltrials.gov/study/{pick})")
# TODO: plain-language rewrite of eligibility_text (target FKGL < grade 8), with "AI-generated summary" label
with st.expander("Eligibility criteria (verbatim)"):
    st.text(row["eligibility_text"] or "")
