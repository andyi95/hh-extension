from tortoise import migrations
from tortoise.migrations import operations as ops
from app.models.enums import ApplicationStatusEnum
from tortoise.fields.base import OnDelete
from tortoise.timezone import now
from uuid import uuid4
from tortoise import fields

class Migration(migrations.Migration):
    initial = True

    operations = [
        ops.CreateModel(
            name='Company',
            fields=[
                ('created_at', fields.DatetimeField(auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('id', fields.IntField(generated=True, primary_key=True, unique=True, db_index=True)),
                ('hh_id', fields.CharField(null=True, unique=True, max_length=20)),
                ('name', fields.CharField(max_length=255)),
            ],
            options={'table': 'companies', 'app': 'models', 'pk_attr': 'id', 'table_description': 'Работодатель. Общий каталог для всех пользователей.'},
            bases=['TimestampMixin', 'Model'],
        ),
        ops.CreateModel(
            name='User',
            fields=[
                ('created_at', fields.DatetimeField(auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('id', fields.IntField(generated=True, primary_key=True, unique=True, db_index=True)),
                ('email', fields.CharField(null=True, unique=True, max_length=320)),
                ('password_hash', fields.CharField(null=True, max_length=255)),
                ('display_name', fields.CharField(null=True, max_length=100)),
                ('is_active', fields.BooleanField(default=True)),
            ],
            options={'table': 'users', 'app': 'models', 'pk_attr': 'id', 'table_description': 'Пользователь расширения.'},
            bases=['TimestampMixin', 'Model'],
        ),
        ops.CreateModel(
            name='AuthSession',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid4, unique=True, db_index=True)),
                ('user', fields.ForeignKeyField('models.User', source_field='user_id', db_constraint=True, to_field='id', related_name='sessions', on_delete=OnDelete.CASCADE)),
                ('refresh_token_hash', fields.CharField(unique=True, max_length=64)),
                ('prev_refresh_token_hash', fields.CharField(null=True, db_index=True, max_length=64)),
                ('rotated_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('device_label', fields.CharField(null=True, max_length=200)),
                ('created_at', fields.DatetimeField(auto_now=False, auto_now_add=True)),
                ('last_used_at', fields.DatetimeField(auto_now=False, auto_now_add=False)),
                ('expires_at', fields.DatetimeField(auto_now=False, auto_now_add=False)),
                ('revoked_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
            ],
            options={'table': 'auth_sessions', 'app': 'models', 'pk_attr': 'id', 'table_description': 'Сессия одной установки расширения, хранит хеш refresh-токена.'},
            bases=['Model'],
        ),
        ops.CreateModel(
            name='Vacancy',
            fields=[
                ('created_at', fields.DatetimeField(auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('id', fields.IntField(generated=True, primary_key=True, unique=True, db_index=True)),
                ('hh_id', fields.CharField(unique=True, max_length=20)),
                ('company', fields.ForeignKeyField('models.Company', source_field='company_id', null=True, db_constraint=True, to_field='id', related_name='vacancies', on_delete=OnDelete.SET_NULL)),
                ('title', fields.CharField(max_length=500)),
                ('description', fields.TextField(null=True, unique=False)),
                ('url', fields.CharField(max_length=500)),
            ],
            options={'table': 'vacancies', 'app': 'models', 'pk_attr': 'id', 'table_description': 'Вакансия. Общий каталог для всех пользователей.'},
            bases=['TimestampMixin', 'Model'],
        ),
        ops.CreateModel(
            name='Application',
            fields=[
                ('created_at', fields.DatetimeField(auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('id', fields.IntField(generated=True, primary_key=True, unique=True, db_index=True)),
                ('user', fields.ForeignKeyField('models.User', source_field='user_id', db_constraint=True, to_field='id', related_name='applications', on_delete=OnDelete.CASCADE)),
                ('vacancy', fields.ForeignKeyField('models.Vacancy', source_field='vacancy_id', db_constraint=True, to_field='id', related_name='applications', on_delete=OnDelete.CASCADE)),
                ('applied_at', fields.DatetimeField(default=now, auto_now=False, auto_now_add=False)),
                ('cover_letter', fields.TextField(null=True, unique=False)),
                ('current_status', fields.CharEnumField(default=ApplicationStatusEnum.SENT, description='SENT: sent\nVIEWED: viewed\nTEST_TASK: test_task\nINTERVIEW: interview\nOFFER: offer\nREJECTED: rejected\nCLOSED: closed', enum_type=ApplicationStatusEnum, max_length=20)),
            ],
            options={'table': 'applications', 'app': 'models', 'unique_together': (('user', 'vacancy'),), 'pk_attr': 'id', 'table_description': 'Отклик пользователя на вакансию.'},
            bases=['TimestampMixin', 'Model'],
        ),
        ops.CreateModel(
            name='ApplicationStatus',
            fields=[
                ('id', fields.IntField(generated=True, primary_key=True, unique=True, db_index=True)),
                ('application', fields.ForeignKeyField('models.Application', source_field='application_id', db_constraint=True, to_field='id', related_name='statuses', on_delete=OnDelete.CASCADE)),
                ('status', fields.CharEnumField(description='SENT: sent\nVIEWED: viewed\nTEST_TASK: test_task\nINTERVIEW: interview\nOFFER: offer\nREJECTED: rejected\nCLOSED: closed', enum_type=ApplicationStatusEnum, max_length=20)),
                ('changed_at', fields.DatetimeField(default=now, auto_now=False, auto_now_add=False)),
                ('comment', fields.TextField(null=True, unique=False)),
                ('created_at', fields.DatetimeField(auto_now=False, auto_now_add=True)),
            ],
            options={'table': 'application_statuses', 'app': 'models', 'pk_attr': 'id', 'table_description': 'Запись истории статусов отклика.'},
            bases=['Model'],
        ),
        ops.CreateModel(
            name='Review',
            fields=[
                ('created_at', fields.DatetimeField(auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('id', fields.IntField(generated=True, primary_key=True, unique=True, db_index=True)),
                ('user', fields.ForeignKeyField('models.User', source_field='user_id', db_constraint=True, to_field='id', related_name='reviews', on_delete=OnDelete.CASCADE)),
                ('vacancy', fields.ForeignKeyField('models.Vacancy', source_field='vacancy_id', db_constraint=True, to_field='id', related_name='reviews', on_delete=OnDelete.CASCADE)),
                ('rating', fields.SmallIntField()),
                ('text', fields.TextField(null=True, unique=False)),
                ('is_public', fields.BooleanField(default=False)),
            ],
            options={'table': 'reviews', 'app': 'models', 'unique_together': (('user', 'vacancy'),), 'pk_attr': 'id', 'table_description': 'Отзыв пользователя о вакансии. Публичные отзывы показываются другим без автора.'},
            bases=['TimestampMixin', 'Model'],
        ),
    ]
