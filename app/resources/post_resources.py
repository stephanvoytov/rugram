from flask import abort, jsonify
from flask_restful import Resource, reqparse
from flask_login import login_required, current_user

from app.models import Post
from app.routes.helpers import cursor_paginate
from app.services import PostService
from app.services.base import NotFoundError, ForbiddenError, ServiceError
from extensions import db

parser = reqparse.RequestParser()
parser.add_argument('text', required=True)
parser.add_argument('image')


def _get_post_or_404(post_id):
    post = db.session.get(Post, post_id)
    if not post:
        abort(404, description=f"Post {post_id} not found")
    return post


class PostResource(Resource):
    def get(self, post_id):
        """Get a single post by ID.
        ---
        tags:
          - Posts
        parameters:
          - in: path
            name: post_id
            type: integer
            required: true
            description: Post ID
        responses:
          200:
            description: Post object
            schema:
              type: object
              properties:
                post:
                  type: object
                  properties:
                    id: {type: integer}
                    text: {type: string}
                    author: {type: string}
                    likes: {type: integer}
                    comments: {type: integer}
          404:
            description: Post not found
        """
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
    def patch(self, post_id):
        """Edit post text (owner only).
        ---
        tags:
          - Posts
        security:
          - sessionAuth: []
        parameters:
          - in: path
            name: post_id
            type: integer
            required: true
          - in: body
            name: body
            required: true
            schema:
              type: object
              properties:
                text:
                  type: string
                  required: true
        responses:
          200:
            description: Post updated
            schema:
              type: object
              properties:
                id: {type: integer}
                text: {type: string}
          403:
            description: Not the owner
          404:
            description: Post not found
        """
        patch_parser = reqparse.RequestParser()
        patch_parser.add_argument('text', required=True, help='Text is required')
        args = patch_parser.parse_args()
        try:
            post = PostService.edit_post(post_id, current_user.id, args['text'])
            return {'id': post.id, 'text': post.text}
        except NotFoundError as e:
            abort(404, description=e.message)
        except ForbiddenError as e:
            abort(403, description=e.message)
        except ServiceError as e:
            abort(400, description=e.message)

    @login_required
    def delete(self, post_id):
        """Delete a post (soft-delete, sets is_deleted=True).
        ---
        tags:
          - Posts
        security:
          - sessionAuth: []
        parameters:
          - in: path
            name: post_id
            type: integer
            required: true
        responses:
          200:
            description: Post deleted
            schema:
              type: object
              properties:
                success: {type: string, example: OK}
          403:
            description: Not the owner
          404:
            description: Post not found
        """
        try:
            PostService.delete_post(post_id, current_user.id)
            return {'success': 'OK'}
        except NotFoundError as e:
            abort(404, description=e.message)
        except ForbiddenError as e:
            abort(403, description=e.message)


class PostListResource(Resource):
    def get(self):
        """List posts (cursor-based pagination).
        ---
        tags:
          - Posts
        parameters:
          - in: query
            name: cursor
            type: integer
            required: false
            description: Last post ID from previous page
          - in: query
            name: limit
            type: integer
            required: false
            default: 20
            description: Items per page (max 100)
        responses:
          200:
            description: Paginated list of posts
            schema:
              type: object
              properties:
                posts:
                  type: array
                  items:
                    type: object
                    properties:
                      id: {type: integer}
                      author_id: {type: integer}
                      text: {type: string}
                cursor: {type: integer, nullable: true}
                has_more: {type: boolean}
        """
        parser = reqparse.RequestParser()
        parser.add_argument('cursor', type=int, default=None, location='args')
        parser.add_argument('limit', type=int, default=20, location='args')
        args = parser.parse_args()
        query = Post.query.order_by(Post.id.desc())
        posts, next_cursor, has_more = cursor_paginate(query, args['cursor'], args['limit'])
        return jsonify({
            'posts': [item.to_dict(only=('id', 'author_id', 'text')) for item in posts],
            'cursor': next_cursor,
            'has_more': has_more,
        })

    @login_required
    def post(self):
        """Create a new post.
        ---
        tags:
          - Posts
        security:
          - sessionAuth: []
        parameters:
          - in: body
            name: body
            required: true
            schema:
              type: object
              properties:
                text:
                  type: string
                  required: true
                  example: Hello world!
                image:
                  type: string
                  required: false
                  description: Base64-encoded image (not yet supported via API)
        responses:
          200:
            description: Post created
            schema:
              type: object
              properties:
                id: {type: integer}
          400:
            description: Missing text
        """
        args = parser.parse_args()
        try:
            post = PostService.create_post(
                author_id=current_user.id,
                text=args['text'],
                image=args.get('image'),
            )
            return {'id': post.id}
        except ServiceError as e:
            return {'error': e.message}, 400