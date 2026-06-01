from flask import abort, jsonify
from flask_restful import Resource, reqparse
from flask_login import login_required, current_user

from app.models import Post
from extensions import db

parser = reqparse.RequestParser()
parser.add_argument('text', required=True)
parser.add_argument('image', required=True)


def abort_if_news_not_found(post_id):
    post = Post.query.get(post_id)
    if not post:
        abort(404, message=f"News {post_id} not found")
    return post


class PostResource(Resource):
    def get(self, post_id):
        posts = abort_if_news_not_found(post_id)
        return jsonify({'posts': posts.to_dict(
            only=('id', 'text', 'image', 'author_id', 'is_deleted')
        )})

    @login_required
    def delete(self, post_id):
        posts = abort_if_news_not_found(post_id)
        if posts.author_id != current_user.id:
            abort(403, message="Not enough permissions")
        posts.is_deleted = True
        db.session.commit()
        return jsonify({'success': 'OK'})


class PostListResource(Resource):
    def get(self):
        posts = Post.query.all()
        return jsonify({'posts': [item.to_dict(
            only=('id', 'author_id', 'text')) for item in posts]})

    @login_required
    def post(self):
        args = parser.parse_args()
        news = Post(
            text=args['text'],
            image=args['image'],
            author_id=current_user.id
        )
        db.session.add(news)
        db.session.commit()
        return jsonify({'id': news.id})