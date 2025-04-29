import os
import time

from flask import render_template, flash, redirect, url_for, Blueprint, request, jsonify, abort
from flask_login import login_user, login_required, logout_user, current_user
from werkzeug.utils import secure_filename

import config
from app.forms import Loginform, RegistrationForm, PostForm, ProfileForm
from app.models import User, Post, Like, Comment
from extencions import db

main_bp = Blueprint('main', __name__, template_folder='../templates')
auth_bp = Blueprint('auth', __name__, template_folder='../templates')
posts_bp = Blueprint('posts', __name__, template_folder='../templates')


@main_bp.route('/')
@main_bp.route('/index')
def index():
    page = request.args.get('page', 1, type=int)
    pagination = Post.query.filter(Post.is_deleted == False).order_by(Post.created_date.desc()).paginate(page=page,
                                                                                                         per_page=15)
    return render_template('main/index.html', posts=pagination.items, pagination=pagination)


@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    form = Loginform()
    if form.validate_on_submit():
        user = User.query.filter(
            (User.email == form.email_or_username.data) |
            (User.username == form.email_or_username.data)
        ).first()
        if not user or not user.check_password(form.password.data):
            flash('Неверная почта/логин или пароль', 'danger')
            return redirect(url_for('auth.login'))

        login_user(user, remember=form.remember.data, force=True)
        return redirect(url_for('main.index'))

    return render_template('auth/login.html', form=form)


@auth_bp.route('/logout')
@login_required
def logout():
    logout_user()
    flash('Вы вышли из системы', 'info')
    return redirect(url_for('main.index'))


@auth_bp.route('/register', methods=['GET', 'POST'])
def register():
    form = RegistrationForm()
    if form.validate_on_submit():
        user = User()
        if not (
                (User.query.filter(User.username == form.username.data).first()) and
                (User.query.filter(User.email == form.email.data).first())
        ):
            user.username = form.username.data
            user.email = form.email.data
            user.set_password(form.password.data)
            db.session.add(user)
            db.session.commit()
            flash('Регистрация прошла успешно! Теперь вы можете войти.', 'success')
            return redirect(url_for('auth.login'))
        flash('Такая почта или такой логин уже существуют', 'danger')
    return render_template('auth/register.html', form=form)


@posts_bp.route('/create', methods=['GET', 'POST'])
@login_required
def create_post():
    form = PostForm()
    if form.validate_on_submit():
        post = Post(
            text=form.text.data,
            author_id=current_user.id
        )

        if form.image.data:
            image = form.image.data
            filename = secure_filename(image.filename)
            unique_filename = f'{current_user.id}_{int(time.time())}_{filename}'
            save_path = os.path.join(config.Config.UPLOAD_FOLDER, 'posts', unique_filename)

            os.makedirs(os.path.dirname(save_path), exist_ok=True)
            image.save(save_path)

            post.image = unique_filename

        db.session.add(post)
        db.session.commit()

        flash('Пост успешно создан!', 'success')
        return redirect(url_for('posts.get_post', post_id=post.id))

    return render_template('posts/create_post.html', form=form, header='Создать публикацию')


@posts_bp.route('/edit_post/<int:post_id>', methods=["GET", "POST"])
@login_required
def edit_post(post_id):
    post = Post.query.filter(Post.id == post_id, Post.author == current_user).first_or_404()
    form = PostForm(obj=post)
    if request.method == "GET":

        if post:
            form.text.data = post.text
            form.image.data = post.image

    if form.validate_on_submit():
        try:
            post.text = form.text.data

            if form.image.data:
                if post.image:
                    old_image_path = os.path.join(config.Config.UPLOAD_FOLDER, 'posts', post.image)
                    if os.path.exists(old_image_path):
                        os.remove(old_image_path)

                image = form.image.data
                if image.filename:
                    filename = secure_filename(image.filename)
                    unique_filename = f'{current_user.id}_{int(time.time())}_{filename}'
                    save_path = os.path.join(config.Config.UPLOAD_FOLDER, 'posts', unique_filename)

                    os.makedirs(os.path.dirname(save_path), exist_ok=True)
                    image.save(save_path)
                    post.image = unique_filename

            db.session.commit()
            flash('Пост успешно обновлен!', 'success')
            return redirect(url_for('posts.get_post', post_id=post.id))

        except Exception as e:
            db.session.rollback()
            flash(f'Ошибка при обновлении поста: {str(e)}', 'danger')

    return render_template('posts/create_post.html', form=form, post=post, header='Редактировать публикацию')


@posts_bp.route('/post/<int:post_id>')
def get_post(post_id):
    post = Post.query.filter(Post.id == post_id, Post.is_deleted == False).first()
    if post:
        return render_template('posts/post.html', post=post)
    return abort(404, description='Такого пользователя не существует')


@main_bp.route('/profile/<user_id_or_username>')
def profile(user_id_or_username):
    if user_id_or_username.isdigit():
        user = User.query.filter(User.id == int(user_id_or_username)).first()
    else:
        user = User.query.filter(User.username == user_id_or_username).first()
    if user:
        return render_template('main/profile.html', user=user)
    return abort(404, description='Такого пользователя не существует')


@main_bp.route('/edit_profile', methods=['GET', 'POST'])
@login_required
def edit_profile():
    form = ProfileForm()
    if form.validate_on_submit():
        # Обновление данных
        current_user.username = form.username.data
        current_user.description = form.description.data

        # Обработка аватара
        if form.profile_image.data:
            filename = secure_filename(form.profile_image.data.filename)
            filepath = os.path.join(config.Config.UPLOAD_FOLDER, filename)
            form.profile_image.data.save(filepath)
            current_user.profile_image = filename

        # Смена пароля (если указан)
        if form.password.data:
            current_user.set_password(form.password.data)

        db.session.commit()
        flash('Профиль обновлен!', 'success')
        return redirect(url_for('profile', username=current_user.username))

    # Заполняем форму текущими данными
    form.username.data = current_user.username
    form.description.data = current_user.description

    return render_template('edit_profile.html', form=form)


@posts_bp.route('/post/<int:post_id>/like', methods=['POST'])
@login_required
def like_post(post_id):
    if not request.is_json:
        return jsonify({'error': 'Request must be JSON'}), 400

    post = Post.query.get_or_404(post_id)
    existing_like = Like.query.filter_by(
        user_id=current_user.id,
        post_id=post_id
    ).first()

    if existing_like:
        db.session.delete(existing_like)
        post.likes_count -= 1
        db.session.commit()
        return jsonify({
            'status': 'unliked',
            'likes_count': post.likes_count
        })

    new_like = Like(
        user_id=current_user.id,
        post_id=post_id
    )
    db.session.add(new_like)
    post.likes_count += 1
    db.session.commit()

    return jsonify({
        'status': 'liked',
        'likes_count': post.likes_count
    })


@posts_bp.route('/post/<int:post_id>/comment', methods=['POST'])
@login_required
def add_comment(post_id):
    post = Post.query.get_or_404(post_id)

    # Проверяем, это AJAX-запрос или обычная форма
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        # Для AJAX-запросов
        data = request.get_json() if request.is_json else request.form
        text = data.get('text', '').strip()
    else:
        # Для обычных форм
        text = request.form.get('text', '').strip()

    if not text:
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify({'error': 'Текст комментария не может быть пустым'}), 400
        flash('Текст комментария не может быть пустым', 'danger')
        return redirect(url_for('posts.post_detail', post_id=post_id))

    new_comment = Comment(
        author_id=current_user.id,
        post_id=post_id,
        text=text
    )

    db.session.add(new_comment)
    post.comments_count += 1
    db.session.commit()

    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return jsonify({
            'status': 'success',
            'comment': {
                'id': new_comment.id,
                'text': new_comment.text,
                'created_date': new_comment.created_date.isoformat(),
                'author': {
                    'id': current_user.id,
                    'username': current_user.username,
                    'profile_image': current_user.profile_image
                }
            },
            'comments_count': post.comments_count
        })

    flash('Комментарий успешно добавлен', 'success')
    return redirect(url_for('posts.post_detail', post_id=post_id))


@posts_bp.route('/delete/<int:post_id>', methods=['DELETE'])
@login_required
def delete_post(post_id):
    post = Post.query.get_or_404(post_id)

    if post.author_id != current_user.id:
        return jsonify({'error': 'Недостаточно прав'}), 403

    post.is_deleted = True
    db.session.commit()

    return jsonify({'success': True})
