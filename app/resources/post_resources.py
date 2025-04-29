from flask import abort, jsonify
from flask_restful import Resource, reqparse

from app.models import Post
from extencions import db

parser = reqparse.RequestParser()
parser.add_argument('text', required=True)
parser.add_argument('image', required=True)
parser.add_argument('user_id', required=True, type=int)


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

    def delete(self, post_id):
        posts = abort_if_news_not_found(post_id)
        posts.is_deleted = True
        db.session.commit()
        return jsonify({'success': 'OK'})


class PostListResource(Resource):
    def get(self):
        posts = Post.query.all()
        return jsonify({'posts': [item.to_dict(
            only=('id', 'author_id', 'text')) for item in posts]})

    def post(self):
        args = parser.parse_args()
        news = Post(
            text=args['text'],
            image=args['image'],
            author_id=args['user_id']
        )
        db.session.add(news)
        db.session.commit()
        return jsonify({'id': news.id})
