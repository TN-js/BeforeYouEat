import subprocess
import os

def convert_mp4_to_gif(video_path, output_gif_path):
    """
    Converts an MP4 video to a high-quality GIF using FFmpeg.
    
    Args:
        video_path (str): Path to the input MP4 video file.
        output_gif_path (str): Path to save the output GIF file.
    """
    # Generate a temporary palette file
    palette_path = "palette.png"
    
    try:
        # Step 1: Generate the palette
        print("Generating palette for optimized GIF...")
        subprocess.run(
            [
                "ffmpeg",
                "-i", video_path,
                "-vf", "fps=15,scale=800:-1:flags=lanczos,palettegen",
                palette_path
            ],
            check=True
        )
        
        # Step 2: Create the GIF using the palette with -filter_complex
        print("Creating the GIF...")
        subprocess.run(
            [
                "ffmpeg",
                "-i", video_path,
                "-i", palette_path,
                "-filter_complex", "fps=15,scale=800:-1:flags=lanczos[x];[x][1:v]paletteuse",
                output_gif_path
            ],
            check=True
        )
        
        print(f"GIF created successfully: {output_gif_path}")
    
    finally:
        # Cleanup: Remove the temporary palette file
        if os.path.exists(palette_path):
            os.remove(palette_path)
            print("Temporary palette file removed.")

# Set the paths
video_file = "videos/editing-entry.mp4"
output_gif = "videos/editing-entry.gif"

# Convert the video to a GIF
convert_mp4_to_gif(video_file, output_gif)
