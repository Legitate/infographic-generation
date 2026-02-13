import os
from PIL import Image

def create_icons(base_image_path, output_dir):
    if not os.path.exists(base_image_path):
        print(f"Error: Base image not found at {base_image_path}")
        return

    try:
        with Image.open(base_image_path) as img:
            sizes = [16, 48, 128]
            for size in sizes:
                resized_img = img.resize((size, size), Image.Resampling.LANCZOS)
                output_path = os.path.join(output_dir, f"icon{size}.png")
                resized_img.save(output_path, "PNG")
                print(f"Created {output_path}")
    except Exception as e:
        print(f"Error processing image: {e}")

if __name__ == "__main__":
    base_dir = os.path.dirname(os.path.abspath(__file__))
    images_dir = os.path.join(base_dir, "images")
    base_icon_path = os.path.join(images_dir, "icon_base.png")

    if not os.path.exists(images_dir):
        os.makedirs(images_dir)

    create_icons(base_icon_path, images_dir)
