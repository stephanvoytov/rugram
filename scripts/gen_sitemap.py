#!/usr/bin/env python3
"""Generate static sitemap.xml at app/static/sitemap.xml.

Run from project root:
    python scripts/gen_sitemap.py

Caddy serves app/static/ directly, so Googlebot gets a plain file
without hitting Flask/gunicorn – avoids mooo.com bot protection.
"""

import os
import sys
from xml.dom import minidom
from xml.etree.ElementTree import Element, SubElement, tostring

# Ensure project root is on sys.path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

os.environ.setdefault("FLASK_ENV", "production")

from app import create_app, db
from app.models import Post, User

SITEMAP_PATH = os.path.join(PROJECT_ROOT, "app", "static", "sitemap.xml")
BASE_URL = "https://rugram.mooo.com"

app = create_app()


def generate() -> str:
    """Return pretty-printed sitemap XML string."""
    with app.app_context():
        urlset = Element("urlset")
        urlset.set("xmlns", "http://www.sitemaps.org/schemas/sitemap/0.9")

        def add_url(loc: str, lastmod=None, priority="0.5", changefreq="weekly"):
            url_el = SubElement(urlset, "url")
            loc_el = SubElement(url_el, "loc")
            loc_el.text = loc
            if lastmod:
                lm_el = SubElement(url_el, "lastmod")
                lm_el.text = (
                    lastmod.strftime("%Y-%m-%d")
                    if hasattr(lastmod, "strftime")
                    else str(lastmod)[:10]
                )
            pr_el = SubElement(url_el, "priority")
            pr_el.text = priority
            cf_el = SubElement(url_el, "changefreq")
            cf_el.text = changefreq

        # Main pages
        add_url(f"{BASE_URL}/", priority="1.0", changefreq="daily")
        add_url(f"{BASE_URL}/help", priority="0.6", changefreq="monthly")

        # Public profiles (users with at least one non-deleted post)
        users_with_posts = (
            db.session.query(User)
            .join(Post, Post.author_id == User.id)
            .filter(Post.is_deleted == False)  # noqa: E712
            .distinct()
            .all()
        )
        for user in users_with_posts:
            last_post = (
                Post.query.filter(Post.author_id == user.id, not Post.is_deleted)
                .order_by(Post.created_date.desc())
                .first()
            )
            lastmod = last_post.created_date if last_post else None
            add_url(
                f"{BASE_URL}/profile/{user.username}",
                lastmod=lastmod,
                priority="0.8",
                changefreq="weekly",
            )

        # All non-deleted posts
        posts = Post.query.filter(Post.is_deleted == False).order_by(Post.created_date.desc()).all()  # noqa: E712
        for post in posts:
            add_url(
                f"{BASE_URL}/post/{post.id}",
                lastmod=post.created_date,
                priority="0.9",
                changefreq="monthly",
            )

        # Pretty-print
        rough = tostring(urlset, encoding="unicode")
        dom = minidom.parseString(rough.encode("utf-8"))
        return dom.toprettyxml(indent="  ", encoding="utf-8")


if __name__ == "__main__":
    xml = generate()
    os.makedirs(os.path.dirname(SITEMAP_PATH), exist_ok=True)
    with open(SITEMAP_PATH, "wb") as f:
        f.write(xml)
    print(f"✓ sitemap written to {SITEMAP_PATH} ({os.path.getsize(SITEMAP_PATH)} bytes)")
