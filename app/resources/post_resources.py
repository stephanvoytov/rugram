from flask import abort, jsonify
from flask_restful import Resource, reqparse
from flask_login import login_required, current_user

from app.models import Post
from extensions import db

parser = reqparse.RequestParser()
parser.add_argument('text', required=True)
parser.add_argument('image')


def _get_post_or_404(post_id):
    post = Post.query.get(post_id)
    if not post:
        abort(404, description=f"Post {post_id} not found")
    return post


class PostResource(Resource):
    def get(self, post_id):
        posts = _get_post_or_404(post_id)
        # Include author info and counts for terminal inline view
        author = posts.author
        liked = posts.is_liked_by(current_user) if current_user.is_authenticated else False
        saved = posts.is_saved_by(current_user) if current_user.is_authenticated else False
        return jsonify({'post': {
            'id': posts.id,
            'text': posts.text,
            'image': posts.image,
            'author_id': posts.author_id,
            'author': author.username,
            'author_image': author.profile_image,
            'is_deleted': posts.is_deleted,
            'likes': posts.likes_count,
            'comments': posts.comments_count,
            'reposts': posts.reposts_count,
            'is_liked': liked,
            'is_saved': saved,
            'time': posts.created_date.isoformat()
        }})

    @login_required
    def delete(self, post_id):
        posts = _get_post_or_404(post_id)
        if posts.author_id != current_user.id:
            abort(403, description="Not enough permissions")
        posts.is_deleted = True
        db.session.commit()
        return jsonify({'success': 'OK'})


class PostListResource(Resource):
    def get(self):
        parser = reqparse.RequestParser()
        parser.add_argument('page', type=int, default=1, location='args')
        parser.add_argument('per_page', type=int, default=20, location='args')
        args = parser.parse_args()
        pagination = Post.query.order_by(Post.id.desc()).paginate(
            page=args['page'], per_page=args['per_page'], error_out=False
        )
        return jsonify({
            'posts': [item.to_dict(only=('id', 'author_id', 'text')) for item in pagination.items],
            'page': pagination.page,
            'pages': pagination.pages,
            'total': pagination.total,
            'has_next': pagination.has_next,
            'has_prev': pagination.has_prev,
        })

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