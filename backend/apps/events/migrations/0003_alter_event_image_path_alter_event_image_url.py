# Generated by Django 5.1.2 on 2024-12-02 04:48

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('events', '0002_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='event',
            name='image_path',
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.AlterField(
            model_name='event',
            name='image_url',
            field=models.URLField(blank=True, null=True),
        ),
    ]
